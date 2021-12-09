import { BigNumber } from "@ethersproject/bignumber";
import { utils } from "ethers";

export const calculateSlippage = (expectedAmount: number, amountOutMin: number): number => {
    const diff = expectedAmount - amountOutMin;
    if (diff == 0) return 0;
    return diff / expectedAmount;
}

export const bigNumberToNumber = (value: BigNumber, decimals: number): number => {
    return parseInt(utils.formatUnits(value, decimals));
}