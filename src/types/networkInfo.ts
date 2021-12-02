import { IERC20Token } from "./erc20Token";

export interface INetworkInfo {
    swapRouterAddresses: string[];
    wethAddress: IERC20Token;
    stableUsd: IERC20Token
}

export interface INetworkInfoConfig {
    [index: number]: INetworkInfo;
}