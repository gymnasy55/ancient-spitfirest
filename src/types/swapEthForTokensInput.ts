import { BigNumber } from "@ethersproject/bignumber";

export const parseSwapEthInput = (val: any): SwapEthForTokensInput => {
    return {
        amountOutMin: val[0],
        path: val[1],
        to: val[2],
        deadline: val[3]
    };
}

export type SwapEthForTokensInput = {
    amountOutMin: BigNumber;
    path: string[];
    to: string;
    deadline: BigNumber;
}