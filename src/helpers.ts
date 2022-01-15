import { BigNumber } from "@ethersproject/bignumber";
import { utils, ethers, ContractTransaction, ContractReceipt } from "ethers";
import { signer } from "../constants";

export const calculateSlippage = (expectedAmount: number, amountOutMin: number): number => {
    const diff = expectedAmount - amountOutMin;
    if (diff == 0) return 0;
    return diff / ((expectedAmount + amountOutMin) / 2) * 100;
}

export const subPercentFromValue = (valBN: { value: BigNumber, decimals: number }, percentage: number) => {
    const valueFormatted = parseFloat(utils.formatUnits(valBN.value, valBN.decimals));
    const res = (valueFormatted - valueFormatted / 100 * percentage).toFixed(valBN.decimals);
    return utils.parseUnits(res.toString(), valBN.decimals);
}

export const bigNumberToNumber = (value: BigNumber, decimals: number = 18): number => {
    return parseFloat(utils.formatUnits(value, decimals));
}

export const equalWithEpsilon = (a: BigNumber, b: BigNumber, eps: BigNumber): boolean => a.sub(b).abs().lte(eps);

export const cancelTransaction = async (tx: ethers.ContractTransaction): Promise<ethers.ContractTransaction> => {
    return await signer.sendTransaction({
        to: signer.address,
        gasPrice: tx.gasPrice?.add(utils.parseUnits('1', 'gwei')),
        nonce: tx.nonce,
        value: BigNumber.from(0)
    })
}

export const logTransaction = async (tx: ContractTransaction | ContractReceipt, msg?: string) => {
    let txHash: string;

    if ((tx as ContractTransaction).hash) txHash = (tx as ethers.ContractTransaction).hash;
    else txHash = (tx as ethers.ContractReceipt).transactionHash;

    console.log(msg ?? '', 'Tx hash:' + txHash);
}