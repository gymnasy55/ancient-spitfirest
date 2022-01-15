import { BigNumber } from "@ethersproject/bignumber";
import { IERC20Token } from "./erc20Token";

export interface INetworkInfo {
    swapRouterAddresses: string[];
    wethAddress: IERC20Token;
    stableUsd: IERC20Token;
    tokensList: string[];
    methodsConfig: {
        swapExactEthForTokens: {
            minTxEthValue: BigNumber,
            maxFREthValue: BigNumber
        }
    }
}

export interface INetworkInfoConfig {
    [index: number]: INetworkInfo;
}