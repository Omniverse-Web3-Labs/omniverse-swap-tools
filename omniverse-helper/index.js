const BN = require('bn.js');
const fs = require('fs');
const { program } = require('commander');
const utils = require('./utils');
const eccrypto = require('eccrypto');
const keccak256 = require('keccak256');
const secp256k1 = require('secp256k1');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { bool, _void, str, u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, Enum, Struct, Vector, Option, Bytes } = require('scale-ts');

const TokenOpcode = Struct({
    op: u8,
    data: Vector(u8),
});

const MintTokenOp = Struct({
    to: Vector(u8),
    amount: u128,
});

const TransferTokenOp = Struct({
    to: Vector(u8),
    amount: u128,
});

const TOKEN_ID = 'Skywalker';

const TRANSFER = 1;
const MINT = 3;

let api;
let chainId;

// Private key
let secret = JSON.parse(fs.readFileSync('./.secret').toString());
let testAccountPrivateKey = secret.sks[secret.index];
let privateKeyBuffer = Buffer.from(utils.toByteArray(testAccountPrivateKey));
let publicKeyBuffer = eccrypto.getPublic(privateKeyBuffer);
let publicKey = '0x' + publicKeyBuffer.toString('hex').slice(2);

async function init(chainName) {
    // Construct
    const wsProvider = new WsProvider('ws://3.74.157.177:9944');
    api = await ApiPromise.create({ provider: wsProvider });

    // Do something
    console.log(api.genesisHash.toHex());

    return true;
}

let signData = (hash, sk) => {
    let signature = secp256k1.ecdsaSign(Uint8Array.from(hash), Uint8Array.from(sk));
    return '0x' + Buffer.from(signature.signature).toString('hex') + (signature.recid == 0 ? '1b' : '1c');
}

let getRawData = (txData) => {
    let bData = Buffer.concat([Buffer.from(new BN(txData.nonce).toString('hex').padStart(32, '0'), 'hex'), Buffer.from(txData.chainId),
        Buffer.from(txData.from.slice(2), 'hex'), Buffer.from(txData.to), Buffer.from(txData.data.slice(2), 'hex')]);
    return bData;
}

async function mint(to, amount) {
    let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);
    let mintData = MintTokenOp.enc({
        to: publicKey,
        amount: amount,
      });
    let data = TokenOpcode.enc({
        op: MINT,
        data: mintData,
    });
    let txData = {
        nonce: nonce,
        chainId: chainId,
        from: publicKey,
        to: TOKEN_ID,
        data: data,
    };
    let bData = getRawData(txData);
    let hash = keccak256(bData);
    txData.signature = signData(hash, privateKeyBuffer);
    console(txData);
}

async function transfer(to, amount) {
    let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);
    let mintData = TransferTokenOp.enc({
        to: publicKey,
        amount: amount,
      });
    let data = TokenOpcode.enc({
        op: TRANSFER,
        data: mintData,
    });
    let txData = {
        nonce: nonce,
        chainId: chainId,
        from: publicKey,
        to: TOKEN_ID,
        data: data,
    };
    let bData = getRawData(txData);
    let hash = keccak256(bData);
    txData.signature = signData(hash, privateKeyBuffer);
    console(txData);
}

async function omniverseBalanceOf(pk) {
    let amount = await api.query.omniverseFactory.tokens(TOKEN_ID, pk);
    console.log('amount', amount);
}

async function accountInfo() {
    console.log('Private key', testAccountPrivateKey);
    console.log('Public key', publicKey);
}

(async function () {
    function list(val) {
		return val.split(',')
	}

    program
        .version('0.1.0')
        .option('-t, --transfer <chain name>,<pk>,<amount>', 'Transfer token', list)
        .option('-m, --mint <chain name>,<pk>,<amount>', 'Mint token', list)
        .option('-o, --omniBalance <chain name>,<pk>', 'Query the balance of the omniverse token', list)
        .option('-s, --switch <index>', 'Switch the index of private key to be used')
        .option('-a, --account', 'Show the account information')
        .parse(process.argv);

    if (program.opts().account) {
        await accountInfo();
    }
    else if (program.opts().transfer) {
        if (program.opts().transfer.length != 3) {
            console.log('3 arguments are needed, but ' + program.opts().transfer.length + ' provided');
            return;
        }
        
        if (!init(program.opts().transfer[0])) {
            return;
        }
        await transfer(program.opts().transfer[1], program.opts().transfer[2]);
    }
    else if (program.opts().mint) {
        if (program.opts().mint.length != 3) {
            console.log('3 arguments are needed, but ' + program.opts().mint.length + ' provided');
            return;
        }
        
        if (!init(program.opts().mint[0])) {
            return;
        }
        await mint(program.opts().mint[1], program.opts().mint[2]);
    }
    else if (program.opts().omniBalance) {
        if (program.opts().omniBalance.length != 2) {
            console.log('2 arguments are needed, but ' + program.opts().omniBalance.length + ' provided');
            return;
        }
        
        if (!init(program.opts().omniBalance[0])) {
            return;
        }
        await omniverseBalanceOf(program.opts().omniBalance[1]);
    }
    else if (program.opts().switch) {
        secret.index = parseInt(program.opts().switch);
        fs.writeFileSync('./.secret', JSON.stringify(secret, null, '\t'));
    }
}());
