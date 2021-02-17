
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js')
BigNumber.config({DECIMAL_PLACES: 0});

const http_options = {
    keepAlive: true,
    withCredentials: false,
    timeout: 1000000, // ms
    headers: [
        {
            name: 'Access-Control-Allow-Origin',
            value: '*'
        }
    ]
};
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545', http_options));

// total blocks 204702
const START_BLOCK = 4588883; // token created at tx 0x5cecf97b5ac22c6c67458f5f8c10c919576686e515fe5a763d6bd52748f886da
const SNAPSHOT_BLOCK = 4793585; // best block before attack started

const MilkShake = '0x8Cf93F2b41bA17F9189Aa7a86576f2764A442eca';

const user_db = './data/users.json';
let users = file_get(user_db);
users = users ? JSON.parse(users) : [];

const shares_db = './data/shares.json';
let shares_details = file_get(shares_db);
if( shares_details ) {
    shares_details = JSON.parse(shares_details);
}

const shares_txt = './data/shares.txt';
let shares = file_get(shares_txt);
    shares = shares ? shares.split('\n') : [];

let exclude = [
    '0x000000000000000000000000000000000000dEaD',
    '0x44dc6Fcc4716234ef04efF8BE41cD73F34733Cb2',
    '0x792a46f30f1F6208b24C8199C3F2403f2Df06637',
    '0xDF260692756Dd4fffe84c15A9E71fEFB648c4aeA',
    '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
    '0x8Cf93F2b41bA17F9189Aa7a86576f2764A442eca',
    '0x78Bd56CA4D781d1Be3808a7AF0A8b5446048c1AC',
    '0x0000000000000000000000000000000000000000',
    '0x0F9399FC81DaC77908A2Dde54Bb87Ee2D17a3373',
];


async function query_event(ctx, event_name, block_start, block_end, callback) {

    const args = {fromBlock: block_start, toBlock: block_end};

    console.log(` -- Querying Event=${event_name} from=${block_start} to=${block_end} blocks=${block_end - block_start}`);
    await ctx.getPastEvents(event_name, args).then(
        async function (events) {
            await callback(events)
        });
}

async function add_user(addr) {
    if (users.indexOf(addr) !== -1)
        return;
    if (exclude.indexOf(addr) !== -1)
        return;
    users.push(addr);
}

async function save_users() {
    console.log(` -- ${users.length} accounts saved.`);
    file_save(user_db, JSON.stringify(users));
}

async function save_shares() {
    console.log(` -- shares saved: ${shares.length}`);
    file_save(shares_txt, shares.join('\n'));
    file_save(shares_db, JSON.stringify(shares_unique));
}

// iCreamToken
// event Transfer(address indexed from, address indexed to, uint256 value);
// MilkShake -- it's BEP20, then we need to get balance

// MasterChef
// event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
// pendingCream(uint256 _pid, address _user) -- get user pending iCream

// SmartChef
// emit Deposit(msg.sender, _amount);
// pendingReward(address _user) -- get user pending iCream


function file_exists(file) {
    try {
        return fs.existsSync(file);
    } catch (e) {
        return false;
    }
    return false;
}

function file_get(file) {
    if (!file_exists(file)) return '';
    return fs.readFileSync(file, 'utf8');
}

function file_save(file, str) {
    try {
        return fs.writeFileSync(file, str, 'utf8');
    } catch (e) {
        console.log(file, e);
        return false;
    }
    return false;
}

function d(v) {
    return new Number(web3.utils.fromWei(v, 'ether')).toFixed(4);
}

const CreamToken = '0x58f651DDE51CAa87c4111B16ee0A6Fab061Ee564';
const CreamToken_abi = require('./abi/CreamToken.json');
const CreamToken_ctx = new web3.eth.Contract(CreamToken_abi, CreamToken);

const SmartChef = '0x3c69a4889e20519d41a76e1bb29cf8fa6d545720';
const SmartChef_abi = require('./abi/SmartChef.json');
const SmartChef_ctx = new web3.eth.Contract(SmartChef_abi, SmartChef);

async function save_users_from_iCreamToken(from, to) {
    await query_event(CreamToken_ctx, 'Transfer', from, to,
        async function (list) {
            for (let i in list) {
                add_user(list[i].returnValues[0]);
                add_user(list[i].returnValues[1]);
            }
        });
}

async function find_all_users() {
    const block = 1000;
    // let's query each 5000 blocks at time
    console.log(`START_BLOCK=${START_BLOCK} SNAPSHOT_BLOCK=${SNAPSHOT_BLOCK} TOTAL=${SNAPSHOT_BLOCK - START_BLOCK}`)
    for (let i = START_BLOCK; i < SNAPSHOT_BLOCK; i += block) {
        const from = i;
        const to = i + block;
        console.log(`- AT ${i} FROM ${from} TO=${to}`);
        await save_users_from_iCreamToken(from, to);
        //await save_users_from_MasterChef(from, to);
    }
    await save_users();
}


const MasterChef = '0x78Bd56CA4D781d1Be3808a7AF0A8b5446048c1AC';
const masterchef_abi = require('./abi/MasterChef.json');
const masterchef_ctx = new web3.eth.Contract(masterchef_abi, MasterChef);
masterchef_ctx.defaultBlock = SNAPSHOT_BLOCK;

const pid_icream = 0;
const pid_bnb = 7;
const pid_busd = 8;

let shares_unique = {};

function process_balances(steep, i, addr, token, pool_icream, pool_lp, bnb_icream, bnb_lp, busd_icream, busd_lp, token_bnb, user_query) {

    const token_str = parseFloat(d(token));
    const pool_icream_str = parseFloat(d(pool_icream));
    const pool_lp_str = parseFloat(pool_lp);
    const bnb_icream_str = parseFloat(d(bnb_icream));
    const bnb_lp_str = parseFloat(bnb_lp);
    const busd_icream_str = parseFloat(d(busd_icream));
    const busd_lp_str = parseFloat(busd_lp);
    const token_bnb_str = parseFloat(token_bnb);

    const share = (token_str + pool_icream_str + pool_lp_str + bnb_icream_str + bnb_lp_str + busd_icream_str + busd_lp_str + token_bnb_str).toFixed(0);

    if (!user_query && share == 0) {
        // no shares
        return;
    }

    const share_wei = web3.utils.toWei(new BigNumber(share).toString(), 'ether');

    // use this if you want to rebuild shares.json
    shares_unique[addr] = {
        'share': parseFloat(share),
        'token': token_str,
        'pool_icream': pool_icream_str,
        'pool_lp': pool_lp_str,
        'bnb_icream': bnb_icream_str,
        'bnb_lp': bnb_lp_str,
        'busd_icream': busd_icream_str,
        'busd_lp': busd_lp_str,
        'ibnb_lp': token_bnb_str,
        'share_wei': share_wei
    }

    if( user_query )
        console.log(shares_unique[addr]);

    // addr,share as seems that JSON.parser only parse first 2k results from shares.json
    shares.push(addr + ',' + share);

    const pct = Number((i / total) * 100).toFixed(2);
    console.log(`${i} (${pct}%) ${addr}=${share}`);

}


// main function to query iCream balance by address on all 3 affected pools:
async function query_masterchef_balance(steep, i, addr, user_query) {

    // excluded address like pools, dev, treasure, etc:
    if (exclude[addr])
        return;

    const token = await iCreamTokenBalance(addr);
    const token_bnb = await iCreamBnbPoolBalance(addr);
    const pool_icream = await iCreamPendingPoolBalance(pid_icream, addr);
    const pool_lp = await iCreamLpPoolBalance(pid_icream, addr);

    const bnb_icream = await iCreamPendingPoolBalance(pid_bnb, addr);
    const bnb_lp = await iCreamLpPoolBalance(pid_bnb, addr);

    const busd_icream = await iCreamPendingPoolBalance(pid_busd, addr);
    const busd_lp = await iCreamLpPoolBalance(pid_busd, addr);

    try {
        await process_balances(steep, i, addr, token, pool_icream, pool_lp, bnb_icream, bnb_lp, busd_icream, busd_lp, token_bnb, user_query);
    } catch (e) {
        console.error(e);
        console.log("**ERROR** addr=" + addr + " i=" + i, e.toString());
        console.log('pool_icream', pool_icream.toString());
        console.log('pool_lp', pool_lp.toString());
        console.log('bnb_icream', bnb_icream.toString());
        console.log('bnb_lp', bnb_lp.toString());
        console.log('busd_icream', busd_icream.toString());
        console.log('busd_lp', busd_lp.toString());
        process.exit(1);
    }
}

// 4) get user balance from iCream BNB Pool
async function iCreamBnbPoolBalance(addr) {
    const result = await SmartChef_ctx.methods.userInfo(addr).call({from: addr}, SNAPSHOT_BLOCK);
    let value_wei = result.amount;
    let rec = new Number(web3.utils.fromWei(value_wei, 'ether')).toFixed(4);
    return Number(rec).toFixed(4);
}

// 3) get user balance staked at pid=0 iCreamPool and pending
async function iCreamPendingPoolBalance(pid, addr) {
    return await masterchef_ctx.methods.pendingCream(pid, addr).call({from: addr}, SNAPSHOT_BLOCK);
    ;
}

// 2) get user balance from iCream Pool (deposited)
async function iCreamLpPoolBalance(pid, addr) {
    const result = await masterchef_ctx.methods.userInfo(pid, addr).call({from: addr}, SNAPSHOT_BLOCK);
    let value_wei = result.amount;
    return uniswapRemoveLiquidity(pid, value_wei); // convert LP to iCream
}

// 1) get user balance from iCream BEP20 Token
async function iCreamTokenBalance(addr) {
    return await CreamToken_ctx.methods.balanceOf(addr).call({from: addr}, SNAPSHOT_BLOCK);
}

let bnb_iclp_ctx;
let uniswap_totalSupply_bnb = 25377.0437; //
let uniswap_reserves_bnb0 = 112199.6655;  //
let uniswap_reserves_bnb1 = 7409.8456;    //

let uniswap_totalSupply_busd = 107960.8967; //
let uniswap_reserves_busd0 = 41008.1435;    //
let uniswap_reserves_busd1 = 334137.4002;   //


function uniswapRemoveLiquidity(pid, value_wei) {

    //to decimal or get weird conversions errors
    let rec = new Number(web3.utils.fromWei(value_wei, 'ether')).toFixed(4);
    // We consider only iCream share, then multiply by * to avoid price conversion issues:
    // (pair1 liquidity * balance / totalSupply)*2
    if (pid == 7)
        rec = (uniswap_reserves_bnb0 * rec / uniswap_totalSupply_bnb) * 2;
    if (pid == 8) {
        rec = (uniswap_reserves_busd0 * rec / uniswap_totalSupply_busd) * 2;
    }

    const share = Number(rec).toFixed(4);
    //console.log(pid, rec, share);
    return share;
}

const dev = '0xDF260692756Dd4fffe84c15A9E71fEFB648c4aeA';
const BEP20_ABI = require('./abi/CreamToken.json');
const UniswapV2Pair_ABI = require('./abi/UniswapV2Pair.json');


// BNB ICLP: Get balance liquidity and total supply to convert LP to iCream later.
const icream_addr = '0x58f651DDE51CAa87c4111B16ee0A6Fab061Ee564';
const bnb_addr = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const busd_addr = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
const bnb_iclp_token = '0x792a46f30f1F6208b24C8199C3F2403f2Df06637';
const busd_iclp_token = '0x44dc6Fcc4716234ef04efF8BE41cD73F34733Cb2';
// 0x58f651DDE51CAa87c4111B16ee0A6Fab061Ee564 iCream
// 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c WBNB


let busd_iclp_ctx;
let uniswap_liquidity_busd;
const total = users.length;

async function query_user_balance( query_this ) {
    if( query_this ){
        await query_masterchef_balance(0, 0, query_this, query_this);
        return;
    }
    //users = ['0xD9794A703e38DA995b4fB950DB4FA42660ee6bC2']; // testcase
    let steep = 0;
    for (let i in users) {
        const addr = users[i];
        if (exclude.indexOf(addr) !== -1)
            continue;
        if (shares_unique[addr]) {
            console.log('found', addr, shares_unique[addr]);
            return;
        }
        if (steep == 1000) {
            steep = 0;
            save_shares();
        }
        await query_masterchef_balance(steep, i, addr);
        steep++;
    }

    save_shares();
    total_shares();

}

function total_shares() {
    let TOTAL_USERS = 0;
    let TOTAL_SHARES_TO_MINT = 0;
    for (let i in shares) {
        const share_data = shares[i].split(',');
        const addr = share_data[0];
        const share = parseFloat(share_data[1]);
        TOTAL_SHARES_TO_MINT += share;
        TOTAL_USERS++;
    }
    console.log('TOTAL_SHARES_TO_MINT', TOTAL_SHARES_TO_MINT, 'USERS', TOTAL_USERS);
}

// step 1:
// FIND USERS THAT INTERACTED WITH iCream
// To join iCream-BNB, iCream-BUSD or iCream Pool
// user must receive a transfer/swap.
//find_all_users();

// step 2:
// Now that we have the list of users, let query balances
// and build shares
query_user_balance(); // 0x5909947Bace5Eb03280F3B9D198ce9Db26d94492

// step 3:
// Test the share database just printing the amount of share needed.
// total_shares();