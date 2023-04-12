# Omniverse operation tools

This project provides tools to make the Omniverse operations.

## Tools Install

* Clone this repo:

    ```sh
    git clone -b web3-grant https://github.com/Omniverse-Web3-Labs/omniverse-swap-tools.git
    ```

* Install the dependent packages.

    ```sh
    cd omniverse-swap-tools/omniverse-helper
    npm install
    ```

* The explanation of the commands.

    ```sh
    node index.js --help
    ```

## Import your private key

```sh
cp .secret-example .secret
```

Copy `.secret-example` as `.secret`, replace the contents of the `sks` with your private key.

## Operations

## Pre-deployed

The pre-deployed [`HttpProvider`](./omniverse-helper/index.js#L43) needs to be set to `3.122.90.113:9933`  

### Accounts

Show all accounts information.

```sh
node index.js -a

secp256k1 unavailable, reverting to browser version
########################################################## 
Account 0
Private key 239fdbce5ad44xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx8c2951dad57959783
Omniverse Account 0x2680c26c90b969bcff991983ac8419482xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx45fcaddaa0964ad57459e07304a1363b9c4516c925d4d07ca9407483a3fb5
Substrate address 5H2phJcDc94hJ6QxxxxxxxxxxxxG1XFRFUQ4iE4sJMTrGkqt
EVM address 0xE49c6F052xxxxxxxxxxxxxxxx21BAed424D8b96f
##########################################################
Account 1
Private key fe489a74c7cfxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx72cddbb41bbe7913d1
Omniverse Account 0xf4d2bbf5b74fb8f4f00b5c80da8d5340883xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxd6e642f25d03df00d222a3e365136e8f071c38a59294ccbaca3359ee152
Substrate address 5HpEVNwHuaspzR4KqxxxxxxxxxxxxdSRMFQrHYgH2UaLZcoG
EVM address 0x88ca1ca86axxxxxxxxxxxxB4981cc535d0B86fe6
```

### Switch

The private key to be used will be switched according to the index.

```sh
node index.js -s 1
```

### Balance

Get the balance of the omniverse token.

```sh
# For FT
# node index.js -o TOKEN_Id,O-ACCOUNT
node index.js -o skywalker,0xfb73e1e37a4999060a9a9b1e38a12f8a7cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxe4dcd28692ae02b7627c2aebafb443e9600e476b465da5c4dddbbc3f2782
secp256k1 unavailable, reverting to browser version
amount 10

# For NFT
# node index.js -o TOKEN_Id,O-ACCOUNT -p uniques, reture all items
node index.js -o skywal,0xfb73e1e37a4999060a9a9b1e38a12f8a7c24169caa39a2fb304dc3506dd2d797f8d7e4dcd28692ae02b7627c2aebafb443e9600e476b465da5c4dddbbc3f2782 -p uniques
secp256k1 unavailable, reverting to browser version
amount [ '1' ]
```

### Faucet

Get test omniverse token from faucet

```sh
# FT
# node index.js -c TOKEN_ID
node index.js -c skywalker

# NFT
# node index.js -c TOKEN_ID,ITEM_ID -p uniques
node index.js -c skywal,5 -p uniques
```

**Note that there needs to be a time before the faucet's arrival.**

### Mint

Mint omniverse token

```sh
# FT
# node index.js -m TOKEN_ID,O-ACCOUNT,AMOUNT
node index.js -m skywalker,0xf4d2bbf5b74fb8f4f00b5c80da8d53xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9dec9d6e642f25d03df00d222a3e365136e8f071c38a59294ccbaca3359ee152,10

# NFT
# node index.js -m TOKEN_ID,O-ACCOUNT,ITEM_ID -p uniques
node index.js -m skywal,0xf4d2bbf5b74fb8f4f00b5c80da8d53xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9dec9d6e642f25d03df00d222a3e365136e8f071c38a59294ccbaca3359ee152,5 -p uniques
```

**Note that the operator of the `Mint` operation needs to be the owner who [creates](https://github.com/Omniverse-Web3-Labs/Omniverse-DLT-Introduction/blob/main/docs/Deployment.md#create-token) and [deployed](https://github.com/Omniverse-Web3-Labs/Omniverse-DLT-Introduction/blob/main/docs/Deployment.md#evm-compatible-chain) the `o-token`**  

### Transfer

Transfer the omniverse token.

```sh
# FT
# node index.js -t TOKEN_ID,O-ACCOUNT,AMOUNT
node index.js -t skywalker,0x725ca9f9d8dcb1bf5d0003e76864612aa96470f2f7axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3d21fed9e328f1b92f4cb1d7c2533552fdafb63f9f4b62d8f16,10

# NFT
# node index.js -m TOKEN_ID,O-ACCOUNT,ITEM_ID -p uniques
node index.js -t skywal,0x725ca9f9d8dcb1bf5d0003e76864612aa96470f2f7axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3d21fed9e328f1b92f4cb1d7c2533552fdafb63f9f4b62d8f16,5 -p uniques
```

### Burn

Burn the omniverse token, only owner can burn himself token.

```sh
# FT
# node index.js -t TOKEN_ID,AMOUNT
node index.js -t skywalker,10

# NFT
# node index.js -m TOKEN_ID,ITEM_ID -p uniques
node index.js -t skywal,5 -p uniques
```

### Owner

Get the owner of an item

```sh
# node index.js -m TOKEN_ID,ITEM_ID
node index.js -n skywal,1
```

## Configuration

**Note that if you deployed your own `o-token`, remember to do the following steps first before making operations:**  

- The [Faucet](#faucet) operation is **not available** for your own `o-token`, as it is just used for pre-deployed [`skywalker` and `skywal`](https://github.com/Omniverse-Web3-Labs/Omniverse-DLT-Introduction/blob/main/docs/README.md#evm-chains)  
- Remember to change the IP address in the [`HttpProvider`](./omniverse-helper/index.js#L43) to your own deployed local `Substrate Parachain`  
- Remember to import your test secret keys as mentioned [above](#import-your-private-key). As you may need to transfer your own `o-token` from one account to another, two secret keys is better, and follow the [Switch](#switch) operation to change the operation account.   
