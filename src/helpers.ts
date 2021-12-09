import { BigNumber } from "@ethersproject/bignumber";
import { utils } from "ethers";

export const calculateSlippage = (excpectedAmount: number, amountOutMin: number): number => {
    const diff = excpectedAmount - amountOutMin;
    if (diff == 0) return 0;
    return diff / excpectedAmount;
}

export const bigNumberToNumber = (value: BigNumber, decimals: number): number => {
    return parseInt(utils.formatUnits(value, decimals));
}