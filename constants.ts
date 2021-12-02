import { INetworkInfoConfig } from "./src/types/networkInfo";

export const networkConfigs: INetworkInfoConfig = {
    [5]: { // goerli
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
    },
    [1]: { // ethereum mainnet
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
    },
}

interface IMethod {
    [methodId: string]: string;
}

export const swapSupportedMethods: IMethod = {
    //    ['0xfb3bdb41']: 'swapETHForExactTokens(uint256,address[],address,uint256)',
    ['0x7ff36ab5']: 'swapExactETHForTokens(uint256,address[],address,uint256)',
}