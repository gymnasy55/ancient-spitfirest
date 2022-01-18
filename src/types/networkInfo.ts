import { BigNumber } from "@ethersproject/bignumber";
import { ERC20TokenInfo } from "./erc20Token";
import { ethers } from 'ethers';
import { TxHandlerBase } from '../handlers/handlerBase';

export interface IHandler {
    [address: string]: IMethod;
}

export interface IMethod {
    [methodId: string]: IHandlerFactory;
}

export interface IHandlerFactory {
    (tx: ethers.ContractTransaction, addressTo: string): Promise<TxHandlerBase>
};

export interface INetworkInfo {
    swapRouterAddresses: string[],
    allowedFrontRunTokens: string[]
    wethAddress: ERC20TokenInfo;
    stableUsd: ERC20TokenInfo;
    methodsConfig: {
        swapExactEthForTokens: {
            minTxEthValue: BigNumber,
            maxFREthValue: BigNumber
        }
    },
    handlers: IHandler
}

export interface INetworkInfoConfig {
    [index: number]: INetworkInfo;
}