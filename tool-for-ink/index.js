const BN = require('bn.js');
const fs = require('fs');
const { program } = require('commander');
const utils = require('./utils');
const eccrypto = require('eccrypto');
const keccak256 = require('keccak256');
const secp256k1 = require('secp256k1');
const { ApiPromise, HttpProvider, Keyring, WsProvider } = require('@polkadot/api');
const request = require('request');
const { u8, u128, Struct, Vector, Bytes } = require('scale-ts');
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
let omniverseContract;

// Private key
let secret = JSON.parse(fs.readFileSync('./.secret').toString());
let testAccountPrivateKey = secret.sks[secret.index];
let mpcPublicKey = secret.mpc;
let privateKeyBuffer = Buffer.from(utils.toByteArray(testAccountPrivateKey));
let publicKeyBuffer = eccrypto.getPublic(privateKeyBuffer);
let publicKey = '0x' + publicKeyBuffer.toString('hex').slice(2);
let keyring = new Keyring({ type: 'ecdsa' });
let sender = keyring.addFromSeed(privateKeyBuffer);

async function init(chainName) {
  let netConfig = config.get(chainName);
  if (!netConfig) {
      console.log('Config of chain (' + chainName + ') not exists');
      return false;
  }
  // Construct
  const provider = new WsProvider(netConfig.nodeAddress);
  api = await ApiPromise.create({ provider, noInitWarn: true });
  chainId = netConfig.omniverseChainId;
  let metadata = JSON.parse(fs.readFileSync(netConfig.metadataPath);
  omniverseContract = new ContractPromise(api, metadata, netConfig.contractAddress);
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

async function initialize(members) {
  await omniverseContract.tx
    .setCoolingDown(netConfig.coolingDown)
    .signAndSend(sender, async({ status, events }) => {
      if (status.isInBlock || status.isFinalized) {
        events
          // find/filter for failed events
          .filter(({ event }) =>
            api.events.system.ExtrinsicFailed.is(event)
          )
          // we know that data for system.ExtrinsicFailed is
          // (DispatchError, DispatchInfo)
          .forEach(({ event: { data: [error, info] } }) => {
            if (error.isModule) {
              // for module errors, we have the section indexed, lookup
              const decoded = api.registry.findMetaError(error.asModule);
              const { docs, method, section } = decoded;
  
              console.log(`${section}.${method}: ${docs.join(' ')}`);
            } else {
              // Other, CannotLookup, BadOrigin, no extra info
              console.log(error.toString());
            }
          });
        if (status.isInBlock) {
          await api.disconnect();
        }
      }
    });
  await omniverseContract.tx
    .setMembers(members)
    .signAndSend(sender, async({ status, events }) => {
      if (status.isInBlock || status.isFinalized) {
        events
          // find/filter for failed events
          .filter(({ event }) =>
            api.events.system.ExtrinsicFailed.is(event)
          )
          // we know that data for system.ExtrinsicFailed is
          // (DispatchError, DispatchInfo)
          .forEach(({ event: { data: [error, info] } }) => {
            if (error.isModule) {
              // for module errors, we have the section indexed, lookup
              const decoded = api.registry.findMetaError(error.asModule);
              const { docs, method, section } = decoded;
  
              console.log(`${section}.${method}: ${docs.join(' ')}`);
            } else {
              // Other, CannotLookup, BadOrigin, no extra info
              console.log(error.toString());
            }
          });
        if (status.isInBlock) {
          await api.disconnect();
        }
      }
    });
}

async function sendTransaction(to, amount, op) {
  let nonce = await omniverseContract.query.getTransactionCount(
    publicKey
  );
  let payload = Fungible.enc({
    op: op,
    ex_data: Array.from(Buffer.from(to.slice(2), 'hex')),
    amount: BigInt(amount),
  });
  console.log('omniverseContract', omniverseContract);
  let txData = {
    nonce: nonce.toJSON(),
    chainId: chainId,
    initiateSC: omniverseContract.address,
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
  await omniverseContract.tx
    .sendOmniverseTransaction(txData)
    .signAndSend(sender, async({ status, events }) => {
      if (status.isInBlock || status.isFinalized) {
        events
          // find/filter for failed events
          .filter(({ event }) =>
            api.events.system.ExtrinsicFailed.is(event)
          )
          // we know that data for system.ExtrinsicFailed is
          // (DispatchError, DispatchInfo)
          .forEach(({ event: { data: [error, info] } }) => {
            if (error.isModule) {
              // for module errors, we have the section indexed, lookup
              const decoded = api.registry.findMetaError(error.asModule);
              const { docs, method, section } = decoded;
  
              console.log(`${section}.${method}: ${docs.join(' ')}`);
            } else {
              // Other, CannotLookup, BadOrigin, no extra info
              console.log(error.toString());
            }
          });
        if (status.isInBlock) {
          await api.disconnect();
        }
      }
    });
  // console.log(result.toJSON());
}

async function omniverseBalanceOf(pk) {
  let amount = await omniverseContract.query.balanceOf(pk);
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

(async function () {
  function list(val) {
    return val.split(',');
  }

  program
    .version('0.1.0')
    .option(
      '-i, --initialize <chainName>,<chain id>|<contract address>,...',
      'Initialize omnioverse contracts',
      list
    )
    .option(
      '-t, --transfer <chainName>,<o-account>,<amount>',
      'Transfer token',
      list
    )
    .option('-m, --mint <chainName>,<o-account>,<amount>', 'Mint token', list)
    .option(
      '-o, --omniBalance <chainName>,<o-account>',
      'Query the balance of the omniverse token',
      list
    )
    .option('-b, --burn <chainName>,<o-account>,<amount>', 'Burn token', list)
    .option(
      '-s, --switch <index>',
      'Switch the index of private key to be used'
    )
    .option('-a, --account', 'Show the account information')
    .parse(process.argv);
    

  if (program.opts().account) {
    await accountInfo();
  } else if (program.opts().initialize) {
    if (program.opts().initialize.length <= 1) {
      console.log(
        'At least 2 arguments are needed, but ' +
          program.opts().initialize.length +
          ' provided'
      );
      return;
    }
    
    if (!(await init(program.opts().initialize[0]))) {
      return;
    }

    let members = [];
    let param = program.opts().initialize.slice(1);
    for (let i = 0; i < param.length; i++) {
        let m = param[i].split('|');
        members.push({
          chain_id: m[0],
          contract_address: m[1]
        });
    }

    await initialize(
      members
    );
  } else if (program.opts().transfer) {
    if (program.opts().transfer.length != 3) {
      console.log(
        '3 arguments are needed, but ' +
          program.opts().transfer.length +
          ' provided'
      );
      return;
    }
    if (!(await init(program.opts().transfer[0]))) {
      return;
    }
    await sendTransaction(
      program.opts().transfer[1],
      program.opts().transfer[2],
      TRANSFER
    );
  } else if (program.opts().mint) {
    if (program.opts().mint.length != 3) {
      console.log(
        '4 arguments are needed, but ' +
          program.opts().mint.length +
          ' provided'
      );
      return;
    }

    if (!(await init(program.opts().mint[0]))) {
      return;
    }
    await sendTransaction(
      program.opts().mint[1],
      program.opts().mint[2],
      MINT
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

    if (!(await init(program.opts().mint[0]))) {
      return;
    }
    await sendTransaction(
      program.opts().burn[1],
      program.opts().burn[2],
      BURN
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

    if (!(await init(program.opts().omniBalance[0]))) {
      return;
    }
    let amount = await omniverseBalanceOf(
      account
    );
    console.log('amount', amount.toHuman());
    api.disconnect();
  } else if (program.opts().switch) {
    secret.index = parseInt(program.opts().switch);
    fs.writeFileSync('./.secret', JSON.stringify(secret, null, '\t'));
  }
})();
