const { time, expectEvent, singletons, ether, BN, expectRevert } = require("@openzeppelin/test-helpers");

const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
const FarmNFT = artifacts.require("FarmNFT");
const UniswapV2PairMock = artifacts.require("UniswapV2PairMock");
const IUniswapV2Pair = artifacts.require("IUniswapV2Pair");
const ERC20Mock = artifacts.require("ERC20Mock");
const NativeSuperTokenMock = artifacts.require("NativeSuperTokenMock");
const ISuperToken = artifacts.require("ISuperToken");
const StreamingFarm = artifacts.require("StreamingFarm");
const IStreamingFarm = artifacts.require("IStreamingFarm");
const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

function getEventByName(receipt, name) {
    return receipt.logs.filter(e => e.event == name)[0];
}

contract("StreamingFarm", accounts => {
    let rewardToken; // token streamed as reward and component of the LP´pair
    let erc20; // second component of the LP pair
    let lp; // LP token
    let sf; // Superfluid host
    let farmFullAbi, farm; // farm contract
    let farmNFT; // NFT contract owned by the farm

    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const user3_2 = accounts[4];
    const someAccount = accounts[9];

    const SECONDS_PER_DAY = 3600*24;
    const SECONDS_PER_WEEK = SECONDS_PER_DAY*7;

    const LEVEL1_WEEKLY_INTEREST = 0.2;
    const LEVEL2_WEEKLY_INTEREST = 0.4;
    const LEVEL3_WEEKLY_INTEREST = 0.6;
    const LEVEL4_WEEKLY_INTEREST = 0.9;
    const LEVEL5_WEEKLY_INTEREST = 1.2;
    const LEVEL6_WEEKLY_INTEREST = 1.6;

    const MAX_ALLOWED_CUM_FLOWRATE = 1E6; // 31,536E12 wad per year

    const errorHandler = err => {
        if (err) throw err;
    };
    before(async () => {
        console.log('before');

        // don't re-deploy the framework if already deployed (running with ganache)
        // TODO: dynamically determine the resolver addr in order to get rid of this constraint
        let TEST_RESOLVER_ADDR = "0x085eAc4a28e4a72913d2FDcC886FB2614a9CB0B3";
        if ((await web3.eth.getCode(TEST_RESOLVER_ADDR)).length <= 2) {
            console.log('no resolver found at expected address. In order to reuse an SF deployment across test runs, ' +
                'start ganache with -m "arch web seek click tomato coconut pistol category attend absent gossip news"' +
                ' and run the test with "--network ganache"');
            console.log("deploying SF framework...");
            await deployFramework(errorHandler, {
                web3,
                from: accounts[0]
            });

            // the deploy script sets the resolver address here
            TEST_RESOLVER_ADDR = process.env.TEST_RESOLVER_ADDRESS;
        }

        console.log('init SF');
        sf = new SuperfluidSDK.Framework({
            web3,
            version: "test",
            resolverAddress: TEST_RESOLVER_ADDR
        });
        await sf.initialize();
/*
        await deployNativeSuperToken(errorHandler, [":", "mock", "MOCK", 1000000], {
            web3,
            from: accounts[0],
            protocolReleaseVersion: "v1"
        });
*/
        console.log('deploy erc20');
        erc20 = await ERC20Mock.new(toWad(1000000));
        console.log(`erc20: ${erc20.address}`);

        console.log('deploy SuperToken (rewardToken)');
        const nst = await NativeSuperTokenMock.new();
        await nst.selfRegister(sf.host.address);
        await nst.initialize("mock", "MOCK", toWad(1000000));
        rewardToken = await ISuperToken.at(nst.address);
        console.log(`rewardToken: ${rewardToken.address}`);

        console.log('deploy LP');
        lp = await UniswapV2PairMock.new(erc20.address, rewardToken.address);
        //lp = await IUniswapV2Pair.at(lp.address);
        console.log(`LP: ${lp.address}`);

        console.log('deploy farm');
        farmFullAbi = await StreamingFarm.new(sf.host.address, lp.address, rewardToken.address, MAX_ALLOWED_CUM_FLOWRATE);
        farm = await IStreamingFarm.at(farmFullAbi.address); // using the public interface for most tests
        //farm = farmInit;
        console.log(`farm: ${farm.address}`);
        const farmNFTAddr = await farm.farmNFT();
        console.log(`farmNFTAddr: ${farmNFTAddr}`);
        farmNFT = await FarmNFT.at(farmNFTAddr);

        // provide the LP with liquidity, setting the initial price to 1
        await erc20.approve(lp.address, toWad(99999999999999));
        await rewardToken.approve(lp.address, toWad(99999999999999));
        await lp.addLiquidity(toWad(1000), toWad(1000));

        // provide the users with LP tokens
        await lp.transfer(user1, toWad(100));
        await lp.transfer(user2, toWad(100));
        await lp.transfer(user3, toWad(100));

        // provide the farm with rewardTokens
        await rewardToken.transfer(farm.address, toWad(1000));

        // pre-approve everything
        await erc20.approve(lp.address, toWad(99999999999999), {from: user1});
        await erc20.approve(lp.address, toWad(99999999999999), {from: user2});
        await rewardToken.approve(lp.address, toWad(99999999999999), {from: user1});
        await rewardToken.approve(lp.address, toWad(99999999999999), {from: user2});
        await lp.approve(farm.address, toWad(99999999999999), {from: user1});
        await lp.approve(farm.address, toWad(99999999999999), {from: user2});
        await lp.approve(farm.address, toWad(99999999999999), {from: user3});

        //await rewardToken.transfer(user1, 10000);
        //await rewardToken.transfer(user2, 10000);

    });

    /*
    The LP pair is now initialized to have 1000 units of each token and has minted 1000 LP tokens.
    Thus 1 LP token represents 1 reward token - this is the reference value for the interest calculation.

    Note that most test cases are not independent of each other. That's because the time component is important
    for the reward levels and with ganache supporting only far forwarding time, building independent tests
    is cumbersome.
    */

    beforeEach(async function() { });

    it("check contract config", async () => {
        const stakingT = await farm.stakingToken();
        assert.equal(stakingT, lp.address, 'stakingToken() address mismatch');

        const rewardT = await farm.rewardToken();
        assert.equal(rewardT, rewardToken.address, 'rewardToken() address mismatch');

        const nft = await farm.farmNFT();
        assert.equal(nft, farmNFT.address, 'farmNFT() address mismatch');

        const nftName = await farmNFT.name();
        assert.equal(nftName, 'FarmNFT', 'NFT name mismatch');

        const rewardSch = await farm.rewardSchedule();
        assert.equal(rewardSch[0][0], 0, 'rewardSchedule()[0][0] (minAge for level1) not 0');
        for(i=1; i<rewardSch.length; i++) {
            assert.isAtLeast(parseInt(rewardSch[i][0]), parseInt(rewardSch[i-1][0]),
                'rewardSchedule() age not monotonically increasing');
            assert.isAtLeast(parseInt(rewardSch[i][1]), parseInt(rewardSch[i-1][1]),
                'rewardSchedule() interest not monotonically increasing');
        }
        assert.equal(rewardSch[0][1], LEVEL1_WEEKLY_INTEREST*1E4, "level1 interest mismatch");
        assert.equal(rewardSch[1][1], LEVEL2_WEEKLY_INTEREST*1E4, "level2 interest mismatch");
        assert.equal(rewardSch[2][1], LEVEL3_WEEKLY_INTEREST*1E4, "level3 interest mismatch");
        assert.equal(rewardSch[3][1], LEVEL4_WEEKLY_INTEREST*1E4, "level4 interest mismatch");
        assert.equal(rewardSch[4][1], LEVEL5_WEEKLY_INTEREST*1E4, "level5 interest mismatch");
        assert.equal(rewardSch[5][1], LEVEL6_WEEKLY_INTEREST*1E4, "level6 interest mismatch");

        const maxAggrFr = await farm.maxAggregateFlowrate();
        assert.equal(maxAggrFr.toString(), String(MAX_ALLOWED_CUM_FLOWRATE));
    });

    // JS can safely handle ints up to ~1E15. In order to simplify the code, amounts inside that bound are used
    const amountS1 = 1E12;
    const expFrS1L1 = Math.floor(amountS1 * LEVEL1_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    let nftIdS1;
    it("user1 adds stake1 - check level 1 flowrate", async () => {
        // assumption: 1 LP = 1 rewardToken
        const ret = await farm.stake(amountS1, {from: user1});
        nftIdS1 = getEventByName(ret, "Stake").args.nftId;

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`U1 S1 L1 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L1),
            "U1 S1 L1 flowrate not as expected"
        );

        const uri = await farmNFT.tokenURI(nftIdS1);
        // source: https://stackoverflow.com/a/11335500
        const regex = /^data:.+\/(.+);base64,(.*)$/;
        const matches = uri.match(/^data:.+\/(.+);base64,(.*)$/);
        if(matches) {
            const [ext, data] = matches.slice(1, 3);
            const metadata = Buffer.from(data, 'base64').toString();
            console.log(`nft1 base64 encoded embedded metadata: ${metadata}`);
        } else {
            console.log(`nft1 uri: ${uri}`);
        }
    });

    it("check nftInfo for stake1", async () => {
        const i = await farm.getNFTInfo(nftIdS1);

        assert.equal(parseInt(i.stakeAmount), amountS1, 'stakeAmount mismatch');
        assert.equal(parseInt(i.referenceValue), amountS1*1, 'referenceValue mismatch');
        assert.equal(i.currentOwner, user1, 'currentOwner mismatch');
        assert.equal(parseInt(i.setLevel), 1, 'setLevel mismatch');
        assert.equal(parseInt(i.availableLevel), 1, 'availableLevel mismatch');
        assert.isAbove(parseInt(i.nextLevelTimestamp), parseInt((await time.latest()).toString()),
            'nextLevelTimestamp not in the future');
    });

    const expFrS1L2 = Math.floor(amountS1 * LEVEL2_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    it("user1 upgrades stake1 to level 2", async () => {
        const canUpgrade = await farm.canUpgradeLevel(nftIdS1);
        assert.equal(canUpgrade, false, "canUpgrade should return false");

        // should do nothing
        await farm.upgradeLevel(nftIdS1);
        const netFlowEarly = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`U1 flowrate: ${netFlowEarly.toString()}`);

        assert.equal(
            netFlowEarly.toString(),
            String(expFrS1L1),
            "U1 S1 L1 flowrate not as expected"
        );

        await time.increase(SECONDS_PER_WEEK + 1);

        const canUpgradeLater = await farm.canUpgradeLevel(nftIdS1);
        assert.equal(canUpgradeLater, true, "canUpgrade should return false");

        const info = await farm.getNFTInfo(nftIdS1);

        assert.equal(parseInt(info.availableLevel), 2, 'availableLevel mismatch');
        // this should still be in the future as pointing to the timestamp for level 3 now
        assert.isAbove(parseInt(info.nextLevelTimestamp), parseInt((await time.latest()).toString()),
            'nextLevelTimestamp not in the future');

        await farm.upgradeLevel(nftIdS1);

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`U1 S1 L2 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L2),
            "U1 S1 L2 flowrate not as expected"
        );
    });

    const amountS2 = 1E12;
    const expFrS2L1 = Math.floor(amountS2 * LEVEL1_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    let nftIdS2;
    it("user2 stakes - check user1 and user2 streams", async () => {
        // assumption: 1 LP = 1 rewardToken
        const ret = await farm.stake(amountS2, {from: user2});
        const netFlowU2 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user2});
        const nftId = getEventByName(ret, "Stake").args.nftId;
        nftIdS2 = nftId;

        console.log(`ntfId: ${nftId}`);

        assert.equal(
            netFlowU2.toString(),
            String(expFrS2L1),
            "U2 S1 L1 flowrate not as expected"
        );

        const netFlowU1 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`U1 S1 L2 flowrate: ${netFlowU1.toString()}`);
        assert.equal(
            netFlowU1.toString(),
            String(expFrS1L2),
            "U1 S1 L2 flowrate not as expected"
        );
    });

    const amountS3 = 5E12;
    const expFrS3L1 = Math.floor(amountS3 * LEVEL1_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    let nftIdS3;
    it("user1 adds stake3 - check cumulative flowrate", async () => {
        // assumption: 1 LP = 1 rewardToken
        const ret = await farm.stake(amountS3, {from: user1});
        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        const nftId = getEventByName(ret, "Stake").args.nftId;
        nftIdS3 = nftId;

        console.log(`ntfId: ${nftId}`);
        console.log(`netFlow: ${netFlow}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L2 + expFrS3L1),
            "flowrate not as expected"
        );
    });

    it("nft for stake1 transferred to user3 - check all flowrates", async () => {
        await farmNFT.safeTransferFrom(user1, user3, nftIdS1, {from: user1});

        const netFlowU1 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`netFlow user1: ${netFlowU1}`);

        assert.equal(
            netFlowU1.toString(),
            String(expFrS3L1),
            "flowrate not as expected for user1"
        );

        const netFlowU3 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`netFlow user3: ${netFlowU3}`);

        assert.equal(
            netFlowU3.toString(),
            String(expFrS1L2),
            "flowrate not as expected for user3"
        );
    });

    it("nft2 can't be transferred by wrong owner", async () => {
        expectRevert(
            farmNFT.safeTransferFrom(user1, user3, nftIdS2, {from: user1}),
            "ERC721: transfer caller is not owner nor approved"
        );
    });

    const amountS4 = 2E12;
    const expFrS4L1 = Math.floor(amountS4 * LEVEL1_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    let nftIdS4;
    it("user3 adds stake4 - check flowrate", async () => {
        const ret = await farm.stake(amountS4, {from: user3});
        const nftId = getEventByName(ret, "Stake").args.nftId;
        console.log(`ntfId: ${nftId}`);
        nftIdS4 = nftId;

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L2 + expFrS4L1),
            "U3 flowrate not as expected"
        );
    });

    it("user2 unstakes stake2 - flowrate expected to be 0", async () => {
        await farm.unstake(nftIdS2, {from: user2});

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user2});
        console.log(`netFlow user2: ${netFlow}`);

        assert.equal(
            netFlow.toString(),
            String(0),
            "flowrate not 0 as expected"
        );
    });

    it("user3 transfers nft4 to user2 - check flowrates", async () => {
        await farmNFT.safeTransferFrom(user3, user2, nftIdS4, {from: user3});

        const netFlowU3 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`netFlow user3: ${netFlowU3}`);

        assert.equal(
            netFlowU3.toString(),
            String(expFrS1L2),
            "flowrate not as expected"
        );

        const netFlowU2 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user2});
        console.log(`netFlow user2: ${netFlowU2}`);

        assert.equal(
            netFlowU2.toString(),
            String(expFrS4L1),
            "flowrate not as expected"
        );
    });

    it("user1 transfers nft3 to user3 - check all flowrates", async () => {
        await farmNFT.safeTransferFrom(user1, user3, nftIdS3, {from: user1});

        const netFlowU1 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user1});
        console.log(`netFlow user1: ${netFlowU1}`);

        assert.equal(
            netFlowU1.toString(),
            String(0),
            "flowrate not as expected for user1"
        );

        const netFlowU3 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`netFlow user3: ${netFlowU3}`);

        assert.equal(
            netFlowU3.toString(),
            String(expFrS1L2 + expFrS3L1),
            "flowrate not as expected for user3"
        );
    });

    it("user2 closes stream and restores by transferring nft4 to itself", async () => {
        await sf.cfa.deleteFlow({
            superToken: rewardToken.address,
            sender: farm.address,
            receiver: user2,
            by: user2
        });

        await farmNFT.safeTransferFrom(user2, user2, nftIdS4, {from: user2});

        const netFlowU2 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user2});
        console.log(`netFlow user2: ${netFlowU2}`);

        assert.equal(
            netFlowU2.toString(),
            String(expFrS4L1),
            "flowrate not as expected"
        );
    });

    // this is important in order to not lock LP tokens once rewards are exhausted
    it("user2 can unstake stake4 with stream stopped", async () => {
        await sf.cfa.deleteFlow({
            superToken: rewardToken.address,
            sender: farm.address,
            receiver: user2,
            by: user2
        });

        const lpBal = await lp.balanceOf(user2);
        await farm.unstake(nftIdS4, {from: user2});
        const lpBalAfter = await lp.balanceOf(user2);

        assert.equal(
            lpBalAfter.toString(),
            lpBal.add(new BN(amountS4)).toString(),
            "unexpected amount of redeemed lp tokens"
        );
    });


    it("user3 closes stream and restores it by transferring NFTs to another account and back", async () => {
        await sf.cfa.deleteFlow({
            superToken: rewardToken.address,
            sender: farm.address,
            receiver: user3,
            by: user3
        });

        let netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`netFlow: ${netFlow}`);

        assert.equal(
            netFlow.toString(),
            String(0),
            "flowrate not as expected"
        );

        await farmNFT.safeTransferFrom(user3, user3_2, nftIdS1, {from: user3});
        await farmNFT.safeTransferFrom(user3, user3_2, nftIdS3, {from: user3});

        await farmNFT.safeTransferFrom(user3_2, user3, nftIdS1, {from: user3_2});
        await farmNFT.safeTransferFrom(user3_2, user3, nftIdS3, {from: user3_2});

        netFlowU3 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`netFlow user3: ${netFlowU3}`);

        assert.equal(
            netFlowU3.toString(),
            String(expFrS1L2 + expFrS3L1),
            "flowrate not as expected"
        );

        netFlowU3_2 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3_2});
        console.log(`netFlow user3_2: ${netFlowU3_2}`);

        assert.equal(
            netFlowU3_2.toString(),
            String(0),
            "flowrate not as expected"
        );
    });

    it("new stake violating farm's max aggregate flowrate constraint should fail", async () => {
        let amountS5 = 300E12; // exceeds the limit with the level1 flowrate
        expectRevert(
            farm.stake(amountS5, {from: user1}),
            "StreamingFarm: not enough flowrate capacity left"
        );

        amountS5 = 35E12; // exceeds the limit with the level6 flowrate
        expectRevert(
            farm.stake(amountS5, {from: user1}),
            "StreamingFarm: not enough flowrate capacity left"
        );
    });

    it("adjust max allowed aggregate flowrate", async () => {
        const curMax = await farm.maxAggregateFlowrate();
        const remaining = await farm.remainingAvailableFlowrate();
        const curUsed = curMax.sub(remaining);
        console.log(`current maxAggregateFlowRate: ${curMax.toString()}, remaining: ${remaining.toString()}, currently used: ${curUsed.toString()}`);

        expectRevert(
            farmFullAbi.setMaxAggregateFlowrate(curUsed, {from: user1}),
            "Ownable: caller is not the owner"
        );

        // set below the minimum currently possible should fail
        expectRevert(
            farmFullAbi.setMaxAggregateFlowrate(curUsed.sub(new BN(1))),
            "StreamingFarm: value below current usage"
        );

        // set to the minimum currently possible should succeed
        await farmFullAbi.setMaxAggregateFlowrate(curUsed);

        // no further stake possible, even with a small amount
        expectRevert(
            farm.stake(1E9, {from: user1}),
            "StreamingFarm: not enough flowrate capacity left"
        );

        // set back to initial value
        await farmFullAbi.setMaxAggregateFlowrate(curMax);
    })

    // user3: s1, s3
    const expFrS1L4 = Math.floor(amountS1 * LEVEL4_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    const expFrS3L4 = Math.floor(amountS3 * LEVEL4_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    it("user2 upgrades stake1 and stake3 to level 4 - check flowrates", async () => {
        let canUpgradeS1 = await farm.canUpgradeLevel(nftIdS1);
        let canUpgradeS3 = await farm.canUpgradeLevel(nftIdS3);
        assert.equal(canUpgradeS1, false, "canUpgrade(s1) should return false");
        assert.equal(canUpgradeS3, false, "canUpgrade(s3) should return false");

        // fast forward to unlock level 4
        await time.increase(SECONDS_PER_DAY*90 + 1);

        canUpgradeS1 = await farm.canUpgradeLevel(nftIdS1);
        canUpgradeS3 = await farm.canUpgradeLevel(nftIdS3);
        assert.equal(canUpgradeS1, true, "canUpgrade(s1) should return true");
        assert.equal(canUpgradeS3, true, "canUpgrade(s3) should return true");

        await farm.upgradeLevel(nftIdS1);

        let netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L4 + expFrS3L1),
            "U1 flowrate not as expected"
        );

        await farm.upgradeLevel(nftIdS3);

        netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L4 + expFrS3L4),
            "U1 flowrate not as expected"
        );
    });

    it("check nftInfo", async () => {
        const nft1Info = await farm.getNFTInfo(nftIdS1);

        //function getNFTInfo(uint256 nftId) external view returns(uint64 creationTimestamp, uint256 stakeAmount, uint256 referenceValue, address currentOwner, uint8 setLevel, uint8 availableLevel, uint64 nextLevelTimestamp);
    });

    const expFrS1L6 = Math.floor(amountS1 * LEVEL6_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    const expFrS3L6 = Math.floor(amountS3 * LEVEL6_WEEKLY_INTEREST / 100 / SECONDS_PER_WEEK);
    it("user2 upgrades stake1 and stake3 to level 6 (max) - check flowrates", async () => {
        let canUpgradeS1 = await farm.canUpgradeLevel(nftIdS1);
        let canUpgradeS3 = await farm.canUpgradeLevel(nftIdS3);
        assert.equal(canUpgradeS1, false, "canUpgrade(s1) should return false");
        assert.equal(canUpgradeS3, false, "canUpgrade(s3) should return false");

        // fast forward to unlock level 4
        await time.increase(SECONDS_PER_DAY*360 + 1);

        canUpgradeS1 = await farm.canUpgradeLevel(nftIdS1);
        canUpgradeS3 = await farm.canUpgradeLevel(nftIdS3);
        assert.equal(canUpgradeS1, true, "canUpgrade(s1) should return true");
        assert.equal(canUpgradeS3, true, "canUpgrade(s3) should return true");

        await farm.upgradeLevel(nftIdS1);

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(expFrS1L6 + expFrS3L4),
            "U1 flowrate not as expected"
        );

        await farm.upgradeLevel(nftIdS3);

        const netFlow2 = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow2.toString()}`);

        assert.equal(
            netFlow2.toString(),
            String(expFrS1L6 + expFrS3L6),
            "U1 flowrate not as expected"
        );

        // should not make a difference as last level reached
        await time.increase(SECONDS_PER_DAY*360 + 1);

        const info = await farm.getNFTInfo(nftIdS1);
        assert.equal(parseInt(info.availableLevel), 6, 'setLevel mismatch');
        assert.equal(parseInt(info.availableLevel), 6, 'availableLevel mismatch');
        // this should now be 0 as no further upgrades possible
        assert.equal(parseInt(info.nextLevelTimestamp), 0, 'nextLevelTimestamp not 0');

        canUpgradeS1 = await farm.canUpgradeLevel(nftIdS1);
        canUpgradeS3 = await farm.canUpgradeLevel(nftIdS3);
        assert.equal(canUpgradeS1, false, "canUpgrade(s1) should return true");
        assert.equal(canUpgradeS3, false, "canUpgrade(s3) should return true");
    });

    it("user3 unstakes stake1 and stake3 - check flowrate 0 and all LP tokens being redeemed", async () => {
        const lpBalBefore = await lp.balanceOf(user3);
        await farm.unstake(nftIdS1, {from: user3});
        await farm.unstake(nftIdS3, {from: user3});
        const lpBalAfter = await lp.balanceOf(user3);

        const netFlow = await sf.cfa.getNetFlow({superToken: rewardToken.address, account: user3});
        console.log(`U3 flowrate: ${netFlow.toString()}`);

        assert.equal(
            netFlow.toString(),
            String(0),
            "U3 flowrate not as expected"
        );

        assert.equal(
            lpBalAfter.sub(lpBalBefore).toString(),
            String(amountS1 + amountS3),
            "wrong amount of redeemed lp tokens"
        );
    });

    // admin withdraw tokens
    it("only admin can withdraw ERC-20 tokens from the contract", async () => {
        const farmRTBal = await rewardToken.balanceOf(farm.address);
        console.log(`rewardToken balance: ${farmRTBal}`);

        // should fail for non-admin
        expectRevert(
            farmFullAbi.withdrawERC20Tokens(rewardToken.address, someAccount, farmRTBal, {from: user1}),
            "Ownable: caller is not the owner"
        );

        const recvRTBal = await rewardToken.balanceOf(someAccount);
        await farmFullAbi.withdrawERC20Tokens(rewardToken.address, someAccount, farmRTBal);
        const recvRTBalAfter = await rewardToken.balanceOf(someAccount);

        assert.equal(
            recvRTBal.add(farmRTBal).toString(),
            recvRTBalAfter.toString(),
            "unexpected receiver balance"
        );
    });

    it("admin can't withdraw LP tokens", async() => {
        expectRevert(
            farmFullAbi.withdrawERC20Tokens(lp.address, someAccount, 1),
            "StreamingFarm: withdrawal of stake tokens forbidden"
        );
    });
});