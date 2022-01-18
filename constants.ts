import { BigNumber } from "@ethersproject/bignumber";
import { utils, ethers } from "ethers";
import { INetworkInfoConfig } from "./src/types/networkInfo";
import { SwapExactEthForTokensHandler } from './src/swapHandlers/swapExactEthForTokens';
import { JsonRpcProvider } from '@ethersproject/providers';
import { env } from 'process';
import fs from 'fs';
import { ITxHandler, TxHandlerBase } from "./src/swapHandlers/swapHandlerBase";

const getTokensListForNetwork = (networkId: number) => {
    return JSON.parse(fs.readFileSync(`./tokensList/${networkId}.json`).toString('utf8')) as string[];
}

const networkConfigs: INetworkInfoConfig = {
    [1]: { // ethereum mainnet
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(1)
    },
    [4]: { // rinkeby
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(1)
    },
    [5]: { // goerli
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(5)
    },
    [97]: {
        swapRouterAddresses: ['0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3'],
        stableUsd: { address: '0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684', decimals: 18 },
        wethAddress: { address: '0xae13d989dac2f0debff460ac112a837c89baa7cd', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('0.01'),
                maxFREthValue: utils.parseEther('0.01')
            }
        },
        tokensList: getTokensListForNetwork(97)
    }
}


interface IMethod {
    [methodId: string]: IHandlerFactory;
}

interface IHandlerFactory {
    (tx: ethers.ContractTransaction, addressTo: string): Promise<TxHandlerBase>
};

export const swapHandlers: IMethod = {
    ['0x7ff36ab5']: async (tx, to) => (new SwapExactEthForTokensHandler(tx, to)), //'swapExactETHForTokens(uint256,address[],address,uint256)',
}

export const provider: JsonRpcProvider = new ethers.providers.WebSocketProvider(env.WS_PROVIDER);
export const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
export const network = networkConfigs[env.CHAIN_ID];

if (!network) throw new Error("Unsupported chain id");

console.log('Targeted tokens ', network.tokensList);