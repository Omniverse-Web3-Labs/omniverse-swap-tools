const BN = require('bn.js');
const fs = require('fs');
const { program } = require('commander');
const utils = require('./utils');
const eccrypto = require('eccrypto');
const keccak256 = require('keccak256');
const secp256k1 = require('secp256k1');
const {
  ApiPromise,
  HttpProvider,
  Keyring,
  WsProvider,
} = require('@polkadot/api');
const request = require('request');
const { u8, u128, Struct, Vector } = require('scale-ts');
const config = require('config');
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

let api;
let chainId;

// Private key
let secret = JSON.parse(fs.readFileSync('./.secret').toString());
let testAccountPrivateKey = secret.sks[secret.index];
let mpcPublicKey = secret.mpc;
let privateKeyBuffer = Buffer.from(utils.toByteArray(testAccountPrivateKey));
let publicKeyBuffer = eccrypto.getPublic(privateKeyBuffer);
let publicKey = '0x' + publicKeyBuffer.toString('hex').slice(2);
let keyring = new Keyring({ type: 'ecdsa' });
let sender = keyring.addFromSeed(privateKeyBuffer);

(async function () {
  function list(val) {
    return val.split(',');
  }

  program
    .version('0.1.0')
    .option(
      '-t, --transfer <chainName>,<o-account>,<amount>',
      'Transfer token',
      list
    )
    .option(
      '-m, --mint <chainName>,<tokenId>,<o-account>,<amount>',
      'Mint token',
      list
    )
    .option(
      '-o, --omniBalance <chainName>,<o-account>',
      'Query the balance of the omniverse token',
      list
    )
    .option('-b, --burn <chainName>,<tokenId>,<amount>', 'Burn token', list)
    .option(
      '-s, --switch <index>',
      'Switch the index of private key to be used'
    )
    .option('-a, --account', 'Show the account information')
    .option(
      '-f, --faucet <chainName>,<tokenId>,<itemId>',
      'Get test token from faucet',
      list
    )
    .option(
      '-c, --create <chainName>,<tokenId>,<itemId>',
      'Get test token from faucet',
      list
    )
    .option(
      '-n, --ownerOf <chainName>,<tokenId>,<itemId>',
      'Get the owner of an item',
      list
    )
    .option(
      '-g, --generateTx <tokenId>,<o-account>,<amount>',
      'Generate a encapsulated Tx Data',
      list
    )
    .option(
      '-d, --deposit <chainName>,<tokenId>,<amount>',
      'Deposit omniverse token to swap',
      list
    )
    .option(
      '-w, --withdraw <chainName>,<tokenId>,<amount>',
      'withdraw omniverse token from swap',
      list
    )
    .option(
      '-al, --addLiquidity <chainName>,<tradingPairId>,<xTokenId>,<xAmount>,<yTokenId>,<yAmount>',
      'Add the liquidity for the omniverse token pair of token X and token Y in swap',
      list
    )
    .option(
      '-x2y, --swapX2Y <chainName>,<tradingPairId>,<amount>',
      'Swap `amount` X token to Y token',
      list
    )
    .option(
      '-y2x, --swapY2X <chainName>,<tradingPairId>,<amount>',
      'Swap `amount` Y token to X token',
      list
    )
    .option(
      '-bs, --balanceOfSwap <chainName>,<tokenId>,<publicKey>',
      'The balance of omniverse token deposit in swap',
      list
    )
    .option('-p, --pallet', 'pallet name')
    .parse(process.argv);

  let palletName = program.opts().pallet ? 'uniques' : 'assets';

  if (program.opts().account) {
    await accountInfo();
    return;
  } else if (program.opts().create) {
    if (program.opts().create.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().create.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().create[0];
    let tokenId = program.opts().create[1];
    let owner = program.opts().create[2];
    if (await init(chainName)) {
      await sendTransaction(api, palletName, 'createToken', sender, [
        owner,
        tokenId,
        null,
        null,
      ]);
      return;
    }
  } else if (program.opts().transfer) {
    if (program.opts().transfer.length != 4) {
      console.log(
        '4 arguments are needed, but ' +
          program.opts().transfer.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().transfer[0];
    let tokenId = program.opts().transfer[1];
    let to = program.opts().transfer[2];
    let amount = program.opts().transfer[3];
    if (await init(chainName)) {
      await sendOmniverseTransaction(tokenId, to, amount, TRANSFER, palletName);
      return;
    }
  } else if (program.opts().mint) {
    if (program.opts().mint.length != 4) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().mint.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().mint[0];
    let tokenId = program.opts().mint[1];
    let to = program.opts().mint[2];
    let amount = program.opts().mint[3];
    if (await init(chainName)) {
      await sendOmniverseTransaction(tokenId, to, amount, MINT, palletName);
    }
    return;
  } else if (program.opts().burn) {
    if (program.opts().burn.length != 2) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().burn.length +
          ' provided'
      );
      return;
    }

    if (!(await init(program.opts().burn[0]))) {
      await sendOmniverseTransaction(
        program.opts().burn[0],
        '0x',
        program.opts().burn[1],
        BURN,
        palletName
      );
    }
    return;
  } else if (program.opts().omniBalance) {
    if (program.opts().omniBalance.length < 2) {
      console.log(
        'at least 2 arguments are needed, but ' +
          program.opts().omniBalance.length +
          ' provided'
      );
      return;
    }
    let account;
    if (program.opts().omniBalance.length == 3) {
      account = program.opts().omniBalance[2];
    } else {
      account = publicKey;
    }
    let chainName = program.opts().omniBalance[0];
    let tokenId = program.opts().omniBalance[1];
    if (await init(chainName)) {
      let amount = await omniverseBalanceOf(palletName, tokenId, account);
      console.log('amount', amount.toHuman());
    }
  } else if (program.opts().balanceOfSwap) {
    if (program.opts().balanceOfSwap.length < 2) {
      console.log(
        'at least 2 arguments are needed, but ' +
          program.opts().balanceOfSwap.length +
          ' provided'
      );
      return;
    }
    let account;
    if (program.opts().balanceOfSwap.length == 3) {
      account = program.opts().balanceOfSwap[2];
    } else {
      account = publicKey;
    }
    let chainName = program.opts().balanceOfSwap[0];
    let tokenId = program.opts().balanceOfSwap[1];
    if (await init(chainName)) {
      let amount = await balanceOfSwap(tokenId, account);
      console.log('amount', amount.toHuman());
    }
  } else if (program.opts().switch) {
    secret.index = parseInt(program.opts().switch);
    fs.writeFileSync('./.secret', JSON.stringify(secret, null, '\t'));
    return;
  } else if (program.opts().faucet) {
    var itemId = null;
    if (palletName == 'assets') {
      if (program.opts().faucet.length >= 1) {
        console.log(
          '1 arguments are needed, but ' +
            program.opts().faucet.length +
            ' provided'
        );
        return;
      }
    } else {
      if (program.opts().faucet.length != 3) {
        console.log(
          '3 arguments are needed, but ' +
            program.opts().faucet.length +
            ' provided'
        );
        return;
      }
      itemId = program.opts().faucet[2];
    }
    await faucet(chainName, palletName, program.opts().faucet[0], itemId);
  } else if (program.opts().ownerOf) {
    if (program.opts().ownerOf.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().ownerOf.length +
          ' provided'
      );
      return;
    }

    if (!(await init(program.opts().ownerOf[0]))) {
      return;
    }
    await ownerOf(program.opts().ownerOf[1], program.opts().ownerOf[2]);
  } else if (program.opts().deposit) {
    if (program.opts().deposit.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().deposit.length +
          ' provided'
      );
    }
    let chainName = program.opts().deposit[0];
    let tokenId = program.opts().deposit[1];
    let amount = program.opts().deposit[2];
    console.log(chainName, tokenId, amount);
    if (await init(chainName)) {
      let mpc = (await api.query.omniverseSwap.mpc()).toHuman();
      let remainBalance = await omniverseBalanceOf(
        'assets',
        tokenId,
        publicKey
      );
      if (BigInt(remainBalance.toJSON()) < amount) {
        console.error('Token not enough.');
      } else {
        let nonce = await api.query.omniverseProtocol.transactionCount(
          publicKey,
          'assets',
          tokenId
        );
        let txData = _innerTransfer(tokenId, mpc, amount, nonce);
        await sendTransaction(api, 'omniverseSwap', 'deposit', sender, [
          tokenId,
          txData,
        ]);
        return;
      }
    }
  } else if (program.opts().withdraw) {
    if (program.opts().withdraw.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().withdraw.length +
          ' provided'
      );
    }
    let chainName = program.opts().withdraw[0];
    let tokenId = program.opts().withdraw[1];
    let amount = program.opts().withdraw[2];
    if (await init(chainName)) {
      let remainBalance = await balanceOfSwap(tokenId, publicKey);
      if (BigInt(remainBalance.toJSON()) < amount) {
        console.error('Token not enough.');
      } else {
        await sendTransaction(api, 'omniverseSwap', 'withdraw', sender, [
          publicKey,
          tokenId,
          amount,
        ]);
        return;
      }
    }
  } else if (program.opts().swapX2Y) {
    if (program.opts().swapX2Y.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().swapX2Y.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().swapX2Y[0];
    let tradingPairId = program.opts().swapX2Y[1];
    let tokenSold = BigInt(program.opts().swapX2Y[2]);
    if (await init(chainName)) {
      let pair = (
        await api.query.omniverseSwap.tradingPairs(tradingPairId)
      ).toJSON();
      if (!pair) {
        console.log('Trading pair not exist.');
      } else {
        let [tokenXIdHex] = (
          await api.query.omniverseSwap.tokenId(tradingPairId)
        ).toJSON();
        let tokenId = Buffer.from(
          tokenXIdHex.replace('0x', ''),
          'hex'
        ).toString('utf8');
        let remainBalance = await balanceOfSwap(tokenId, publicKey);
        if (BigInt(remainBalance.toJSON()) < tokenSold) {
          console.log('Deposit omniverse token not enough.');
        } else {
          await swapX2Y(tradingPairId, pair, tokenSold);
          return;
        }
      }
    }
  } else if (program.opts().addLiquidity) {
    if (program.opts().addLiquidity.length != 6) {
      console.log(
        '6 arguments are needed, but ' +
          program.opts().addLiquidity.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().addLiquidity[0];
    if (await init(chainName)) {
      let tradingPairId = program.opts().addLiquidity[1];
      let xTokenId = program.opts().addLiquidity[2];
      let xAmount = program.opts().addLiquidity[3];
      let yTokenId = program.opts().addLiquidity[4];
      let yAmount = program.opts().addLiquidity[5];
      let pair = (
        await api.query.omniverseSwap.tradingPairs(tradingPairId)
      ).toJSON();
      if (pair) {
        [xTokenId, yTokenId] = (
          await api.query.omniverseSwap.tokenId(tradingPairId)
        ).toJSON();
      }
      await addLiquidity(
        tradingPairId,
        pair,
        xTokenId,
        BigInt(xAmount),
        yTokenId,
        BigInt(yAmount)
      );
      return;
    }
  } else if (program.opts().swapY2X) {
    if (program.opts().swapY2X.length != 2) {
      console.log(
        '2 arguments are needed, but ' +
          program.opts().swapY2X.length +
          ' provided'
      );
      return;
    }
    let chainName = program.opts().swapY2X[0];
    let tradingPairId = program.opts().swapY2X[1];
    let amount = program.opts().swapY2X[2];
    if (await init(chainName)) {
      let pair = (
        await api.query.omniverseSwap.tradingPairs(tradingPairId)
      ).toJSON();
      if (!pair) {
        console.log('Trading pair not exist.');
      } else {
        let [, tokenYIdHex] = (
          await api.query.omniverseSwap.tokenId(tradingPairId)
        ).toJSON();
        let tokenId = Buffer.from(
          tokenYIdHex.replace('0x', ''),
          'hex'
        ).toString('utf8');
        let remainBalance = await balanceOfSwap(tokenId, publicKey);
        if (BigInt(remainBalance.toJSON()) < tokenSold) {
          console.log('Deposit omniverse token not enough.');
        } else {
          await swapY2X(tradingPairId, pair, amount);
          return;
        }
      }
    }
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
  } else {
    program.outputHelp();
    return;
  }
  await api.disconnect();
})();

async function init(chainName) {
  // Construct
  let nodeAddress = config.get(chainName).nodeAddress;
  if (nodeAddress.startsWith('ws')) {
    let provider = new WsProvider(config.get(chainName).nodeAddress);
    api = await ApiPromise.create({ provider, noInitWarn: true });
  } else {
    let provider = new HttpProvider(config.get(chainName).nodeAddress);
    api = await ApiPromise.create({ provider, noInitWarn: true });
  }
  chainId = config.get(chainName).omniverseChainId;
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

async function sendOmniverseTransaction(tokenId, to, amount, op, palletName) {
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
  await sendTransaction(api, palletName, 'sendTransaction', sender, [
    tokenId,
    txData,
  ]);
}

async function faucet(palletName, tokenId, itemId) {
  let faucetSeviceUrl = config.get(chainName).faucetSeviceUrl;
  if (faucetSeviceUrl.length == 0) {
    console.log('Faucet service not exist.');
    return;
  }
  let options = {
    url:
      faucetSeviceUrl +
      '/get_token?publicKey=' +
      publicKey +
      '&tokenId=' +
      tokenId +
      '&pallet=' +
      palletName +
      '&itemId=' +
      itemId,
    method: 'POST',
  };
  let result = await syncRequest(options);
  console.log(result);
}

async function ownerOf(tokenId, itemId) {
  let collectionId = (
    await api.query.uniques.tokenId2CollectionId(tokenId)
  ).toJSON();
  if (collectionId != null) {
    let itemInfo = (
      await api.query.uniques.asset(collectionId, itemId)
    ).toJSON();
    if (itemInfo) {
      console.log('owner:', itemInfo.owner);
    } else {
      console.log('Item not exist.');
    }
  } else {
    console.log('Collection not exist.');
  }
}

async function addLiquidity(
  tradingPairId,
  pair,
  xTokenId,
  xAmount,
  yTokenId,
  yAmount
) {
  let xMin = xAmount;
  let yMin = yAmount;
  if (pair) {
    let [reverseX, reverseY] = pair;
    reverseX = BigInt(reverseX);
    reverseY = BigInt(reverseY);
    let amountYOptimal = (xAmount * reverseY) / reverseX;
    if (amountYOptimal < yAmount) {
      yMin = amountYOptimal;
    } else {
      let amountXOptimal = (yAmount * reverseX) / reverseY;
      xMin = amountXOptimal;
    }
  }
  await sendTransaction(api, 'omniverseSwap', 'addLiquidity', sender, [
    tradingPairId,
    publicKey,
    xAmount,
    yAmount,
    xMin,
    yMin,
    xTokenId,
    yTokenId,
  ]);
}

async function swapX2Y(tradingPairId, pair, tokenSold) {
  let [reverseX, reverseY] = pair;
  reverseX = BigInt(reverseX);
  reverseY = BigInt(reverseY);
  let bought = (tokenSold * reverseY) / (tokenSold + reverseX);
  await sendTransaction(api, 'omniverseSwap', 'swapX2y', sender, [
    tradingPairId,
    publicKey,
    tokenSold,
    bought,
  ]);
}

async function swapY2X(tradingPairId, pair, tokenSold) {
  let [reverseX, reverseY] = pair;
  reverseX = BigInt(reverseX);
  reverseY = BigInt(reverseY);
  let bought = (tokenSold * reverseX) / (tokenSold + reverseY);
  await sendTransaction(api, 'omniverseSwap', 'swapY2x', sender, [
    tradingPairId,
    publicKey,
    tokenSold,
    bought,
  ]);
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
  let payload = Fungible.enc({
    op: TRANSFER,
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
  return txData;
}

async function generateTxData(XtokenId, Xamount, YtokenId, Yamount) {
  let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);

  _innerTransfer(XtokenId, mpcPublicKey, Xamount, nonce);

  let nonce2 = nonce.add(new BN(1));
  _innerTransfer(YtokenId, mpcPublicKey, Yamount, nonce2);
}

async function transfer(palletName, tokenId, to, amount) {
  let nonce = await api.query.omniverseProtocol.transactionCount(
    publicKey,
    palletName,
    tokenId
  );
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

async function omniverseBalanceOf(palletName, tokenId, pk) {
  let amount = await api.query[palletName].tokens(tokenId, pk);
  return amount;
}

async function balanceOfSwap(tokenId, pk) {
  let amount = await api.query.omniverseSwap.balance(pk, tokenId);
  return amount;
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

async function sendTransaction(
  api,
  moduleName,
  methodName,
  account,
  arguments
) {
  api.tx[moduleName][methodName](...arguments).signAndSend(
    account,
    async ({ status, events }) => {
      if (status.isInBlock || status.isFinalized) {
        events
          // find/filter for failed events
          .filter(({ event }) => api.events.system.ExtrinsicFailed.is(event))
          // we know that data for system.ExtrinsicFailed is
          // (DispatchError, DispatchInfo)
          .forEach(
            ({
              event: {
                data: [error, info],
              },
            }) => {
              if (error.isModule) {
                // for module errors, we have the section indexed, lookup
                const decoded = api.registry.findMetaError(error.asModule);
                const { docs, method, section } = decoded;

                console.log(`${section}.${method}: ${docs.join(' ')}`);
              } else {
                // Other, CannotLookup, BadOrigin, no extra info
                console.log(error.toString());
              }
            }
          );
        if (status.isInBlock) {
          await api.disconnect();
        }
      }
    }
  );
}
