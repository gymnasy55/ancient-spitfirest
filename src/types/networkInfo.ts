import { BigNumber } from "@ethersproject/bignumber";
import { ERC20TokenInfo } from "./erc20Token";
import { ethers } from 'ethers';
import { TxHandlerBase } from '../handlers/handlerBase';

export enum Networks {
    BSC_TESTNET = '97'
}
export interface INetworkParams<T> {
    [Networks.BSC_TESTNET]: T
}
export interface IHandlerConfig {
    [address: string]:
    {
        factories: IMethodHandlerFactoryRecord
    };
}

export interface IMethodHandlerFactoryRecord {
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
    frUnitAddress: string,
    methodsConfig: {
        swapExactEthForTokens: {
            minTxEthValue: BigNumber,
            maxFREthValue: BigNumber
        }
    },
    handlers: IHandlerConfig
}

export type NetworkInfoConfig = INetworkParams<INetworkInfo>;