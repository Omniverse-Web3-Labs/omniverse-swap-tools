const BN = require('bn.js');
const fs = require('fs');
const { program } = require('commander');
const utils = require('./utils');
const eccrypto = require('eccrypto');
const keccak256 = require('keccak256');
const secp256k1 = require('secp256k1');
const { ApiPromise, HttpProvider, Keyring } = require('@polkadot/api');
const request = require('request');
const { bool, _void, str, u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, Enum, Struct, Vector, Option, Bytes } = require('scale-ts');

const TokenOpcode = Struct({
    op: u8,
    data: Vector(u8),
});

const MintTokenOp = Struct({
    to: Bytes(64),
    amount: u128,
});

const TransferTokenOp = Struct({
    to: Bytes(64),
    amount: u128,
});

const TOKEN_ID = [4];

const TRANSFER = 1;
const MINT = 3;

const FaucetSeviceUrl = 'http://3.74.157.177:7788';

let api;
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
    const httpProvider = new HttpProvider('http://3.74.157.177:9933');
    api = await ApiPromise.create({ provider: httpProvider });

    // Do something
    console.log(api.genesisHash.toHex());

    return true;
}

let signData = (hash, sk) => {
    let signature = secp256k1.ecdsaSign(Uint8Array.from(hash), Uint8Array.from(sk));
    return '0x' + Buffer.from(signature.signature).toString('hex') + (signature.recid == 0 ? '1b' : '1c');
}

let getRawData = (txData) => {
    let bData = Buffer.concat([Buffer.from(new BN(txData.nonce).toString('hex').padStart(32, '0'), 'hex'), Buffer.from(new BN(txData.chainId).toString('hex').padStart(2, '0'), 'hex'),
        Buffer.from(txData.from.slice(2), 'hex'), Buffer.from(txData.to.replace('0x', ''), 'hex'), Buffer.from(txData.data.slice(2), 'hex')]);
    return bData;
}

async function mint(tokenId, to, amount) {
    let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);
    let mintData = MintTokenOp.enc({
        to: new Uint8Array(Buffer.from(to.slice(2), 'hex')),
        amount: BigInt(amount),
      });
    // console.log('mintData', mintData);
    let data = TokenOpcode.enc({
        op: MINT,
        data: Array.from(mintData),
    });
    let txData = {
        nonce: nonce.toJSON(),
        chainId: chainId,
        from: publicKey,
        to: tokenId,
        data: utils.toHexString(Array.from(data)),
    };
    // console.log(Buffer.from(txData.to.replace('0x', ''), 'hex'));
    let bData = getRawData(txData);
    let hash = keccak256(bData);
    txData.signature = signData(hash, privateKeyBuffer);
    // console.log(txData, Array.from(data));
    let result = await api.tx.omniverseFactory.sendTransaction(tokenId, txData).signAndSend(sender);
    console.log(result.toJSON());
}

async function claim(tokenId) {
    let options = {
        url: FaucetSeviceUrl+ '/get_token?publicKey=' + publicKey + '&tokenId=' + tokenId,
        method: "POST",
    }
    let result = await syncRequest(options);
    console.log(result);
}

async function swapX2Y(tradingPair, tokenId, tokenSold, minToken) {
    let tx = await transfer(tokenId, mpcPublicKey, tokenSold);
    let result = await api.tx.omniverseSwap.swapX2y(tradingPair, tokenSold, minToken, tokenId, tx).signAndSend(sender);
    console.log(result.toJSON());
}

async function swapY2X(tradingPair, tokenId, tokenSold, minToken) {
    let tx = await transfer(tokenId, mpcPublicKey, tokenSold);
    let result = await api.tx.omniverseSwap.swapY2x(tradingPair, tokenSold, minToken, tokenId, tx);
    console.log(result);
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

async function transfer(tokenId, to, amount) {
    let nonce = await api.query.omniverseProtocol.transactionCount(publicKey);
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
    // console.log(txData);
    return txData;
}

async function omniverseBalanceOf(tokenId, pk) {
    let amount = await api.query.omniverseFactory.tokens(tokenId, pk);
    console.log('amount', amount.toHuman());
}

async function accountInfo() {
    console.log('Private key', testAccountPrivateKey);
    console.log('Public key', publicKey);
    console.log('Substrate address', sender.address);
}

(async function () {
    function list(val) {
		return val.split(',')
	}

    program
        .version('0.1.0')
        .option('-t, --transfer <tokenId>,<pk>,<amount>', 'Transfer token', list)
        .option('-m, --mint <tokenId>,<pk>,<amount>', 'Mint token', list)
        .option('-o, --omniBalance <tokenId>,<pk>', 'Query the balance of the omniverse token', list)
        .option('-s, --switch <index>', 'Switch the index of private key to be used')
        .option('-a, --account', 'Show the account information')
        .option('-c, --claim <tokenId>', 'Get test token from faucet', list)
        .option('-x2y, --swapX2Y <tradingPair>,<XtokenId>,<soldAmount>,<getMinAmount>', 'Swap X token to Y token', list)
        .option('-y2x, --swapY2X <tradingPair>,<YtokenId>,<soldAmount>,<getMinAmount>', 'Swap Y token to X token', list)
        .parse(process.argv);

    if (program.opts().account) {
        await accountInfo();
    }
    else if (program.opts().transfer) {
        if (program.opts().transfer.length != 3) {
            console.log('3 arguments are needed, but ' + program.opts().transfer.length + ' provided');
            return;
        }
        
        if (!await init()) {
            return;
        }
        await transfer(program.opts().transfer[0], program.opts().transfer[1], program.opts().transfer[2]);
    }
    else if (program.opts().mint) {
        if (program.opts().mint.length != 3) {
            console.log('3 arguments are needed, but ' + program.opts().mint.length + ' provided');
            return;
        }
        
        if (!await init()) {
            return;
        }
        await mint(program.opts().mint[0], program.opts().mint[1], program.opts().mint[2]);
    }
    else if (program.opts().omniBalance) {
        if (program.opts().omniBalance.length > 2) {
            console.log('2 arguments are needed, but ' + program.opts().omniBalance.length + ' provided');
            return;
        }
        let account;
        if (program.opts().omniBalance.length == 2) {
            account = program.opts().omniBalance[1];
        } else {
            account = publicKey;
        }
        
        if (!await init()) {
            return;
        }
        await omniverseBalanceOf(program.opts().omniBalance[0], account);
    }
    else if (program.opts().switch) {
        secret.index = parseInt(program.opts().switch);
        fs.writeFileSync('./.secret', JSON.stringify(secret, null, '\t'));
    }
    else if (program.opts().claim) {
        if (program.opts().claim.length != 1) {
            console.log('1 arguments are needed, but ' + program.opts().mint.length + ' provided');
            return;
        }

        await claim(program.opts().claim[0]);
    }
    else if (program.opts().swapX2Y) {
        if (program.opts().swapX2Y.length != 4) {
            console.log('4 arguments are needed, but ' + program.opts().omniBaswapX2Ylance.length + ' provided');
            return;
        }

        if (!await init()) {
            return;
        }

        await swapX2Y(program.opts().swapX2Y[0], program.opts().swapX2Y[1], program.opts().swapX2Y[2], program.opts().swapX2Y[3]);
    }
}());
