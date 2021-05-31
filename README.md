# About

Whenever LP tokens are deposited into the farm contract:
* mint an NFT which represents that deposit to the token sender
  * persist creation timestamp
* open a stream to the NFT owner

NFT contract:
* transfer hook: call Farm.updateStream(). Closes the old stream and opens a new one to the new owner

Farm contract:

getAge(id): forwards to the NFT contract. Could easily be changed to locally keep track of age for a different deployment.

possible actions:
* (re)open a stream: 
* upgrade flowrate
* update receiver

MIVA/xdai pair: 0x19b8eb5ffc078a0b50274c08d955900bd0007e32

## test cases

update stream when nothing changed
2 NFTs in different levels:
  update one
  close one


```
ganache-cli -f https://kovan-rpc.lab10.io -m "arch web seek click tomato coconut pistol category attend absent gossip news"
resolver: 0x085eAc4a28e4a72913d2FDcC886FB2614a9CB0B3
```

## console

```
SuperfluidSDK = require("@superfluid-finance/js-sdk")
sf = new SuperfluidSDK.Framework({web3, version: "test", resolverAddress: "0x085eAc4a28e4a72913d2FDcC886FB2614a9CB0B3"})
await sf.initialize();

t0 = await ERC20Mock.new(1000000)
t1 = await ERC20Mock.new(1000000)
lp = await UniswapV2PairMock.new(1000, t0.address, t1.address)
t0.transfer(lp.address, 10000)
t1.transfer(lp.address, 10000)
farm = await StreamingFarm.new(sf.host.address, lp.address, t0.address)
lp.approve(farm.address, 1000)

```

xdai:
sfHost: 0x2dFe937cD98Ab92e59cF3139138f18c823a4efE7
stakingToken (MIVA/xdai LP): 0x19b8eb5ffc078a0b50274c08d955900bd0007e32
rewardToken (MIVA): 0x63e62989D9EB2d37dfDB1F93A22f063635b07d51

test: maxCumFlowrate: 100 MIVA / 1 week
SECONDS_PER_WEEK = 3600*24*7 = 604800
100E18 / SECONDS_PER_WEEK = 165343915343915

farm = await StreamingFarm.new("0x2dFe937cD98Ab92e59cF3139138f18c823a4efE7", "0x19b8eb5ffc078a0b50274c08d955900bd0007e32", "0x63e62989D9EB2d37dfDB1F93A22f063635b07d51", 165343915343915)

v0.1: 0x5244CD3f8a496F9A5F58E4Cdc46c799B90f8EDDF
v0.2: 0x4512Fc20A4D427239a0913a4bf2cC1a394986686
v0.3: 0xFa262bbF43108a6c3FD12E3fe664bCF1bdf59AE8 (100x)

TODO: 
* make NFT ownership transferrable
* token URI
* shutdown method / ownership handover

## DummyNFT (yin / yang)

kovan: https://kovan.etherscan.io/token/0x5338b465c082ec5a21048cc05465a524a1f6ef32?a=0#inventory

```
data:application/json;base64,eyJuYW1lIjoiRHVtbXlORlQiLCJkZXNjcmlwdGlvbiI6ICJkdW1teSBkZXNjcmlwdGlvbiIsImltYWdlIjoiZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlCNGJXeHVjejBpYUhSMGNEb3ZMM2QzZHk1M015NXZjbWN2TWpBd01DOXpkbWNpSUhacFpYZENiM2c5SWkwME1DQXROREFnT0RBZ09EQWlQanhqYVhKamJHVWdjajBpTXpraUx6NDhjR0YwYUNCbWFXeHNQU0lqWm1abUlpQmtQU0pOTUN3ek9HRXpPQ3d6T0NBd0lEQWdNU0F3TEMwM05tRXhPU3d4T1NBd0lEQWdNU0F3TERNNFlURTVMREU1SURBZ01DQXdJREFzTXpnaUx6NDhZMmx5WTJ4bElISTlJalVpSUdONVBTSXhPU0lnWm1sc2JEMGlJMlptWmlJdlBqeGphWEpqYkdVZ2NqMGlOU0lnWTNrOUlpMHhPU0l2UGp3dmMzWm5QZz09In0=
```
... decoded outer:
```
{"name":"DummyNFT","description": "dummy description","image":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9Ii00MCAtNDAgODAgODAiPjxjaXJjbGUgcj0iMzkiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCwzOGEzOCwzOCAwIDAgMSAwLC03NmExOSwxOSAwIDAgMSAwLDM4YTE5LDE5IDAgMCAwIDAsMzgiLz48Y2lyY2xlIHI9IjUiIGN5PSIxOSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgcj0iNSIgY3k9Ii0xOSIvPjwvc3ZnPg=="}
```
IPFS: QmeAnAU3xbpuibSXbwF3BLQ9wULPwh6J8SMeREYrmnenSa

### test run on matic - token addr 0x202ab7902be80020ab0bacbc6a41530ef18c4e12

id 0 - ipfs URI with base64 SVG image
tokenURI: ipfs://QmeAnAU3xbpuibSXbwF3BLQ9wULPwh6J8SMeREYrmnenSa
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/0/token-transfers
OK in blockscout, FAIL in OpenSea

id 1 - base64 URI with base64 SVG image
tokenURI: data:application/json;base64,eyJuYW1lIjoiRHVtbXlORlQiLCJkZXNjcmlwdGlvbiI6ICJkdW1teSBkZXNjcmlwdGlvbiIsImltYWdlIjoiZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQSE4yWnlCNGJXeHVjejBpYUhSMGNEb3ZMM2QzZHk1M015NXZjbWN2TWpBd01DOXpkbWNpSUhacFpYZENiM2c5SWkwME1DQXROREFnT0RBZ09EQWlQanhqYVhKamJHVWdjajBpTXpraUx6NDhjR0YwYUNCbWFXeHNQU0lqWm1abUlpQmtQU0pOTUN3ek9HRXpPQ3d6T0NBd0lEQWdNU0F3TEMwM05tRXhPU3d4T1NBd0lEQWdNU0F3TERNNFlURTVMREU1SURBZ01DQXdJREFzTXpnaUx6NDhZMmx5WTJ4bElISTlJalVpSUdONVBTSXhPU0lnWm1sc2JEMGlJMlptWmlJdlBqeGphWEpqYkdVZ2NqMGlOU0lnWTNrOUlpMHhPU0l2UGp3dmMzWm5QZz09In0=
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/1/token-transfers
FAIL in blockscout, FAIL in OpenSea

id 2 - ipfs+gw URI with base64 SVG image
tokenURI: https://ipfs.io/ipfs/QmeAnAU3xbpuibSXbwF3BLQ9wULPwh6J8SMeREYrmnenSa
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/2/token-transfers
OK in blockscout, FAIL in OpenSea

id 3 - ipfs URI with ipfs SVG image link
tokenURI: ipfs://QmWumcFZrkZeL3xWBsfX3AdfQXnTUvyiDnJB1s5EhpRgKE
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/3/token-transfers
FAIL in blockscout, OK in OpenSea

id 4 - ipfs URI with https image link
tokenURI: ipfs://QmVU2JZ47edKZ6dUkx4YRXafiviVZiJCG7W5AwDSH12YEj
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/4/token-transfers
OK in blockscout (non-cached), OK in OpenSea (cached)

id 5 - base64 URI with base64 image - copy of UniV3Pos[6092]
tokenURI: data:application/json;base64,eyJuYW1lIjoiVW5pc3dhcCAtIDAuMyUgLSBVU0RDL0hFWCAtIDAuMDI0NjE1PD4wLjAyNTY3MCIsICJkZXNj ...
https://explorer-mainnet.maticvigil.com/tokens/0x202ab7902be80020ab0bacbc6a41530ef18c4e12/instance/5/token-transfers
FAIL in blockscout, FAIL in OpenSea

## constraints

min. 500k / pool oder 2 Jahre

check README
test instructions
deployment instructions (per lp token) 
change max aggr. FR