import { BigNumber } from "@ethersproject/bignumber";
import { utils, ethers, ContractTransaction, ContractReceipt } from "ethers";
import { signer } from "../constants";
import fs from 'fs';
import state from "./state";
import { ERC20TokenInfo } from './types/erc20Token';


export const getTokensListForNetwork = (networkId: number) => {
    return (JSON.parse(fs.readFileSync(`./tokensList/${networkId}.json`).toString('utf8')) as ERC20TokenInfo[])
        .reduce<{ [key: string]: { decimals: number } }>((prev, cur) => {
            prev[cur.address] = { decimals: cur.decimals };
            return prev;
        }, {});
}

export const calculateSlippage = (amountOut: number, amountOutMin: number): number => {
    return (amountOut / amountOutMin) * 100 - 100;
}

export const subPercentFromValue = (valBN: { value: BigNumber, decimals: number }, percentage: number) => {
    const valueFormatted = parseFloat(utils.formatUnits(valBN.value, valBN.decimals));
    const res = (valueFormatted - (valueFormatted / 100) * percentage).toFixed(valBN.decimals);
    return utils.parseUnits(res.toString(), valBN.decimals);
}

export const bigNumberToNumber = (value: BigNumber, decimals: number = 18): number => {
    return parseFloat(utils.formatUnits(value, decimals));
}

export const equalWithEpsilon = (a: BigNumber, b: BigNumber, eps: BigNumber): boolean => a.sub(b).abs().lte(eps);

export const cancelTransaction = async (nonce: number, tx: ethers.ContractTransaction): Promise<ethers.ContractTransaction> => {
    return await signer.sendTransaction({
        to: signer.address,
        gasPrice: tx.gasPrice?.add(utils.parseUnits('1', 'gwei')),
        nonce: nonce,
        value: BigNumber.from(0)
    })
}

export const logTransaction = async (tx: ContractTransaction | ContractReceipt, msg?: string) => {
    let txHash: string;

    if ((tx as ContractTransaction).hash) txHash = (tx as ethers.ContractTransaction).hash;
    else txHash = (tx as ethers.ContractReceipt).transactionHash;

    console.log(msg ?? '', 'Tx hash: ' + txHash);
}

export const logToFile = async (fileName: string, message: string) => {
    const filePath = './logs/';

    if (!fs.existsSync(filePath))
        fs.mkdirSync(filePath);

    var stream = fs.createWriteStream(filePath + `${fileName}.log`, { flags: 'a+' });
    stream.write(message);
    stream.end();
}

export const handleError = async (error?: any) => {
    let errMsg;
    if (error && error instanceof Error) errMsg = error.message;
    else errMsg = JSON.stringify(error)

    await logToFile('errors', `[${new Date().toDateString()}]\n` + errMsg + '\n');

    state.resetActiveFrontrun();
}