const BN = require('bn.js');
const fs = require('fs');
const { program } = require('commander');
const utils = require('./utils');
const eccrypto = require('eccrypto');
const keccak256 = require('keccak256');
const secp256k1 = require('secp256k1');
const { ApiPromise, HttpProvider, Keyring } = require('@polkadot/api');
const request = require('request');
const { u8, u128, Struct, Vector, Bytes } = require('scale-ts');

const { encodeAddress, blake2AsHex } = require('@polkadot/util-crypto');

// EVM
const Web3 = require('web3');

const Fungible = Struct({
  op: u8,
  ex_data: Vector(u8),
  amount: u128,
});

const TRANSFER = 0;
const MINT = 1;
const BURN = 2;

const FaucetSeviceUrl = 'http://3.122.90.113:7788';

let api;
// EVM 0, Polkadot 1
let chainId = 1;

// Private key
let secret = JSON.parse(fs.readFileSync('./.secret').toString());
let testAccountPrivateKey = secret.sks[secret.index];
let mpcPublicKey = secret.mpc;
let privateKeyBuffer = Buffer.from(utils.toByteArray(testAccountPrivateKey));
let publicKeyBuffer = eccrypto.getPublic(privateKeyBuffer);
let publicKey = '0x' + publicKeyBuffer.toString('hex').slice(2);
let keyring = new Keyring({ type: 'ecdsa' });
let sender = keyring.addFromSeed(privateKeyBuffer);

async function init() {
  // Construct
  const httpProvider = new HttpProvider('http://3.122.90.113:9933');
  api = await ApiPromise.create({ provider: httpProvider });

  // Do something
  console.log(api.genesisHash.toHex());

  return true;
}

let signData = (hash, sk) => {
  let signature = secp256k1.ecdsaSign(
    Uint8Array.from(hash),
    Uint8Array.from(sk)
  );
  return (
    '0x' +
    Buffer.from(signature.signature).toString('hex') +
    (signature.recid == 0 ? '1b' : '1c')
  );
};

let getRawData = (txData) => {
  let bData = Buffer.concat([
    Buffer.from(new BN(txData.nonce).toString('hex').padStart(32, '0'), 'hex'),
    Buffer.from(new BN(txData.chainId).toString('hex').padStart(8, '0'), 'hex'),
    Buffer.from(txData.initiatorAddress, 'utf-8'),
    Buffer.from(txData.from.slice(2), 'hex'),
  ]);
  console.log(bData);

  let fungible = Fungible.dec(txData.payload);
  bData = Buffer.concat([bData, Buffer.from([fungible.op])]);

  bData = Buffer.concat([bData, Buffer.from(fungible.ex_data)]);
  bData = Buffer.concat([
    bData,
    Buffer.from(
      new BN(fungible.amount).toString('hex').padStart(32, '0'),
      'hex'
    ),
  ]);

  return bData;
};

async function sendTransaction(tokenId, to, amount, op, palletName) {
  let nonce = await api.query.omniverseProtocol.transactionCount(
    publicKey,
    palletName,
    tokenId
  );
  let payload = Fungible.enc({
    op: op,
    ex_data: Array.from(Buffer.from(to.slice(2), 'hex')),
    amount: BigInt(amount),
  });
  let txData = {
    nonce: nonce.toJSON(),
    chainId: chainId,
    initiatorAddress: tokenId,
    from: publicKey,
    payload: utils.toHexString(Array.from(payload)),
  };
  // console.log(Buffer.from(txData.to.replace('0x', ''), 'hex'));
  let bData = getRawData(txData);
  let hash = keccak256(bData);
  txData.signature = signData(hash, privateKeyBuffer);
  // console.log(txData, Array.from(data));
  // for test
  console.log(bData.toString('hex'));
  console.log(hash);
  console.log(txData.signature);
  // test end
  console.log(txData);
  let result = await api.tx[palletName]
    .sendTransaction(tokenId, txData)
    .signAndSend(sender);
  console.log(result.toJSON());
}

async function claim(tokenId) {
  let options = {
    url:
      FaucetSeviceUrl +
      '/get_token?publicKey=' +
      publicKey +
      '&tokenId=' +
      tokenId,
    method: 'POST',
  };
  let result = await syncRequest(options);
  console.log(result);
}

async function swapX2Y(tradingPair, tokenSold) {
  let pair = (await api.query.omniverseSwap.tradingPairs(tradingPair)).toJSON();
  if (!pair) {
    console.log('Trading pair not exist.');
    return;
  }
  let [reverseX, reverseY] = pair;
  reverseX = BigInt(reverseX);
  reverseY = BigInt(reverseY);
  let [tokenXIdHex] = (
    await api.query.omniverseSwap.tokenId(tradingPair)
  ).toJSON();
  let bought = (tokenSold * reverseY) / (tokenSold + reverseX);
  let tokenId = Buffer.from(tokenXIdHex.replace('0x', ''), 'hex').toString(
    'utf8'
  );
  let remainBalance = await omniverseBalanceOf(tokenId, publicKey);
  if (BigInt(remainBalance.toJSON()) < tokenSold) {
    console.log('Token not enough.');
    return;
  }
  let tx = await transfer(mpcPublicKey, tokenSold);
  let result = await api.tx.omniverseSwap
    .swapX2y(tradingPair, tokenSold, bought, tokenId, tx)
    .signAndSend(sender);
  console.log(result.toJSON());
}

async function swapY2X(tradingPair, tokenSold) {
  let pair = (await api.query.omniverseSwap.tradingPairs(tradingPair)).toJSON();
  if (!pair) {
    console.log('Trading pair not exist.');
    return;
  }
  let [reverseX, reverseY] = pair;
  reverseX = BigInt(reverseX);
  reverseY = BigInt(reverseY);
  let [, tokenYIdHex] = (
    await api.query.omniverseSwap.tokenId(tradingPair)
  ).toJSON();
  let bought = (tokenSold * reverseX) / (tokenSold + reverseY);
  let tokenId = Buffer.from(tokenYIdHex.replace('0x', ''), 'hex').toString(
    'utf8'
  );
  let remainBalance = await omniverseBalanceOf(tokenId, publicKey);
  if (BigInt(remainBalance.toJSON()) < tokenSold) {
    console.log('Token not enough.');
    return;
  }
  let tx = await transfer(mpcPublicKey, tokenSold);
  let result = await api.tx.omniverseSwap
    .swapY2x(tradingPair, tokenSold, bought, tokenId, tx)
    .signAndSend(sender);
  console.log(result.toJSON());
}

async function syncRequest(options) {
  return new Promise(function (resolve, reject) {
    request(options, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

function _innerTransfer(tokenId, to, amount, nonce) {
  let transferData = TransferTokenOp.enc({
    to: new Uint8Array(Buffer.from(to.slice(2), 'hex')),
    amount: BigInt(amount),
  });
  let data = TokenOpcode.enc({
    op: TRANSFER,
    data: Array.from(transferData),
  });
  let txData = {
    nonce: nonce.toJSON(),
    chainId: chainId,
    from: publicKey,
    to: tokenId,
    data: utils.toHexString(Array.from(data)),
  };
  let bData = getRawData(txData);
  let hash = keccak256(bData);
  txData.signature = signData(hash, privateKeyBuffer);
  console.log(txData);
  // for test
  console.log(bData.toString('hex'));
  console.log(hash);
  console.log('signature ', txData.signature);
  // test end
}

async function generateTxData(XtokenId, Xamount, YtokenId, Yamount) {
  let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);

  _innerTransfer(XtokenId, mpcPublicKey, Xamount, nonce);

  let nonce2 = nonce.add(new BN(1));
  _innerTransfer(YtokenId, mpcPublicKey, Yamount, nonce2);
}

async function transfer(to, amount) {
  let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);
  let txData = {
    nonce: nonce.toJSON(),
    chainId: chainId,
    initiatorAddress: '0x',
    from: publicKey,
    opType: TRANSFER,
    opData: to,
    amount: BigInt(amount),
  };
  let bData = getRawData(txData);
  let hash = keccak256(bData);
  txData.signature = signData(hash, privateKeyBuffer);
  console.log(txData);
  // for test
  console.log(bData.toString('hex'));
  console.log(hash);
  console.log('signature ', txData.signature);
  // test end

  return txData;
}

async function omniverseBalanceOf(tokenId, pk) {
  let amount = await api.query.assets.tokens(tokenId, pk);
  return amount;
}

async function getPublicKey(publicKey) {
  // `publicKey` starts from `0x`
  const pubKey = publicKey.substring(2);

  const y = '0x' + pubKey.substring(64);
  // console.log(y);

  const _1n = BigInt(1);
  let flag = BigInt(y) & _1n ? '03' : '02';
  // console.log(flag);

  const x = Buffer.from(pubKey.substring(0, 64), 'hex');
  // console.log(pubKey.substring(0, 64));
  const finalX = Buffer.concat([Buffer.from([flag]), x]);
  const finalXArray = new Uint8Array(finalX);
  // console.log("Public Key: \n", finalXArray);
  const addrHash = blake2AsHex(finalXArray);
  return encodeAddress(addrHash);
}

async function accountInfo() {
  const web3 = new Web3();

  for (eleidx in secret.sks) {
    console.log('##########################################################');
    console.log('Account', eleidx);
    console.log('Private key', secret.sks[eleidx]);

    let skBuffer = Buffer.from(utils.toByteArray(secret.sks[eleidx]));
    let pkBuffer = eccrypto.getPublic(skBuffer);
    let pk = '0x' + pkBuffer.toString('hex').slice(2);
    console.log('Omniverse Account', pk);

    let subAccount = keyring.addFromSeed(skBuffer);
    console.log('Substrate address', subAccount.address);

    console.log(
      'EVM address',
      web3.eth.accounts.privateKeyToAccount(secret.sks[eleidx]).address
    );
  }
}

(async function () {
  function list(val) {
    return val.split(',');
  }

  program
    .version('0.1.0')
    .option(
      '-t, --transfer <tokenId>,<o-account>,<amount>',
      'Transfer token',
      list
    )
    .option('-m, --mint <tokenId>,<o-account>,<amount>', 'Mint token', list)
    .option(
      '-o, --omniBalance <tokenId>,<o-account>',
      'Query the balance of the omniverse token',
      list
    )
    .option('-b, --burn <tokenId>,<o-account>,<amount>', 'Burn token', list)
    .option(
      '-s, --switch <index>',
      'Switch the index of private key to be used'
    )
    .option('-a, --account', 'Show the account information')
    .option('-c, --claim <tokenId>', 'Get test token from faucet', list)
    .option(
      '-g, --generateTx <tokenId>,<o-account>,<amount>',
      'Generate a encapsulated Tx Data',
      list
    )
    .option(
      '-x2y, --swapX2Y <tradingPair>,<amount>',
      'Swap `amount` X token to Y token',
      list
    )
    .option(
      '-y2x, --swapY2X <tradingPair>,<amount>',
      'Swap `amount` Y token to X token',
      list
    )
    .option(
      '-p, --pallet',
      'pallet name'
    )
    .parse(process.argv);
    
  let palletName = program.opts().pallet ? 'uniques' : 'assets';

  if (program.opts().account) {
    await accountInfo();
  } else if (program.opts().transfer) {
    if (program.opts().transfer.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().transfer.length +
          ' provided'
      );
      return;
    }
    if (!(await init())) {
      return;
    }
    await sendTransaction(
      program.opts().transfer[0],
      program.opts().transfer[1],
      program.opts().transfer[2],
      TRANSFER,
      palletName
    );
  } else if (program.opts().mint) {
    if (program.opts().mint.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().mint.length +
          ' provided'
      );
      return;
    }

    if (!(await init())) {
      return;
    }
    await sendTransaction(
      program.opts().mint[0],
      program.opts().mint[1],
      program.opts().mint[2],
      MINT,
      palletName
    );
  } else if (program.opts().burn) {
    if (program.opts().burn.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().burn.length +
          ' provided'
      );
      return;
    }

    if (!(await init())) {
      return;
    }
    await sendTransaction(
      program.opts().burn[0],
      program.opts().burn[1],
      program.opts().burn[2],
      BURN,
      palletName
    );
  } else if (program.opts().omniBalance) {
    if (program.opts().omniBalance.length > 2) {
      console.log(
        '2 arguments are needed, but ' +
          program.opts().omniBalance.length +
          ' provided'
      );
      return;
    }
    let account;
    if (program.opts().omniBalance.length == 2) {
      account = program.opts().omniBalance[1];
    } else {
      account = publicKey;
    }

    if (!(await init())) {
      return;
    }
    let amount = await omniverseBalanceOf(
      program.opts().omniBalance[0],
      account
    );
    console.log('amount', amount.toHuman());
  } else if (program.opts().switch) {
    secret.index = parseInt(program.opts().switch);
    fs.writeFileSync('./.secret', JSON.stringify(secret, null, '\t'));
  } else if (program.opts().claim) {
    if (program.opts().claim.length != 1) {
      console.log(
        '1 arguments are needed, but ' +
          program.opts().mint.length +
          ' provided'
      );
      return;
    }

    await claim(program.opts().claim[0]);
  } else if (program.opts().swapX2Y) {
    if (program.opts().swapX2Y.length != 2) {
      console.log(
        '2 arguments are needed, but ' +
          program.opts().swapX2Y.length +
          ' provided'
      );
      return;
    }

    if (!(await init())) {
      return;
    }

    await swapX2Y(program.opts().swapX2Y[0], BigInt(program.opts().swapX2Y[1]));
  } else if (program.opts().swapY2X) {
    if (program.opts().swapY2X.length != 2) {
      console.log(
        '2 arguments are needed, but ' +
          program.opts().swapY2X.length +
          ' provided'
      );
      return;
    }

    if (!(await init())) {
      return;
    }

    await swapY2X(program.opts().swapY2X[0], BigInt(program.opts().swapY2X[1]));
  } else if (program.opts().generateTx) {
    if (program.opts().generateTx.length != 4) {
      console.log(
        '4 arguments are needed, but ' +
          program.opts().generateTx.length +
          ' provided'
      );
      return;
    }

    if (!(await init())) {
      return;
    }

    await generateTxData(
      program.opts().generateTx[0],
      program.opts().generateTx[1],
      program.opts().generateTx[2],
      program.opts().generateTx[3]
    );
  }
})();
