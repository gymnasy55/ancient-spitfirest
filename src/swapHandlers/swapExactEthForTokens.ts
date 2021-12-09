import { ethers, BigNumber, utils } from "ethers";
import { provider, network, signer } from '../../constants';
import { ERC20, ERC20__factory, UniswapRouterV2, UniswapRouterV2__factory } from "../../out/typechain";
import { calculateSlippage, bigNumberToNumber } from "../helpers";
import { parseSwapEthInput, SwapEthForTokensInput } from "../types/swapEthForTokensInput";
import { SwapHandlerBase } from './swapHandlerBase';
import fs from 'fs';
import { FixedFormat } from "@ethersproject/bignumber";

export class SwapExactEthForTokensHandler extends SwapHandlerBase {
    public async handleSwap(tx: ethers.providers.TransactionResponse, router: UniswapRouterV2): Promise<void> {
        if (!tx.to) throw new Error('Tx "to" is null or undefined');

        if (tx.value.lt(network.methodsConfig.swapExactEthForTokens.minTxEthValue)) {
            console.error('Tx value is lower than minimum required');
            return;
        }

        const decodedTx = this.decodeTransactionArguments(tx);

        console.log('Decoded TX: ', JSON.stringify(decodedTx));

        const tokenAddress = decodedTx.path[decodedTx.path.length - 1];
        const token = ERC20__factory.connect(tokenAddress, signer);
        const tokenDecimals = await token.decimals();

        const amountOut = await router.getAmountsOut(
            tx.value,
            decodedTx.path
        );

        const amountOutFormatted = bigNumberToNumber(amountOut[amountOut.length - 1], tokenDecimals);
        const amountOutArgsFormatted = bigNumberToNumber(decodedTx.amountOutMin, tokenDecimals);

        console.log(
            '\namount out: ', amountOutFormatted,
            '\namount out min:', amountOutArgsFormatted);

        const slippage = calculateSlippage(
            amountOutFormatted,
            amountOutArgsFormatted);

        console.log('slippage: ', slippage, '%');

        const ethToSend = network.methodsConfig.swapExactEthForTokens.maxFREthValue as BigNumber;

        const tokensGet = await this.performFrontrunSwap(router, token, decodedTx.path, ethToSend);

        // waiting for frontrun tx execution
        // !UNCOMMENT! await tx.wait();

        const ethGet = await this.performPostSwap(router, [token.address, network.wethAddress.address], tokensGet);

        await logToFile(
            `\nTime: ${new Date().toDateString()} | Eth spent: ${bigNumberToNumber(ethToSend, 18).toFixed(8)} | Slippage: ${slippage}\n` +
            `Eth received after frontrun swap: ${bigNumberToNumber(ethGet, 18).toFixed(8)} | Profit: ${bigNumberToNumber(ethToSend.sub(ethGet), 18).toFixed(8)}\n` +
            `Token address: ${token.address} | Tokens received: ${bigNumberToNumber(tokensGet, tokenDecimals).toFixed(8)}`
        )

        console.log('Eth spent: ', bigNumberToNumber(ethToSend, 18))
        console.log('Eth received after frontrun swap: ', bigNumberToNumber(ethGet, 18))
        console.log('Profit: ', bigNumberToNumber(ethToSend.sub(ethGet), 18))
        console.log('\n\n');
    }
    public getFunctionSignature(): string {
        return 'swapExactETHForTokens(uint256,address[],address,uint256)'
    }

    public getMethodId(): string { return ''; }

    private async performFrontrunSwap(
        router: UniswapRouterV2,
        token: ERC20,
        path: string[],
        ethValue: BigNumber): Promise<BigNumber> {

        console.log('!FR SWAP!');

        const amountOut = await router.getAmountsOut(
            ethValue,
            path
        );
        // do swapExactEthForTokens

        const tokensGet = amountOut[amountOut.length - 1];
        console.log('Tokens get from swap: ', bigNumberToNumber(tokensGet, await token.decimals()));

        return tokensGet;
    }

    private async performPostSwap(
        router: UniswapRouterV2,
        path: string[],
        tokensAmount: BigNumber): Promise<BigNumber> {

        console.log('!POST SWAP!');

        const amountOut = await router.getAmountsOut(
            tokensAmount,
            path
        );
        // do swapExactTokensForEth

        const ethGet = amountOut[amountOut.length - 1];
        return ethGet;
    }

    private decodeTransactionArguments(tx: ethers.providers.TransactionResponse): SwapEthForTokensInput {
        return parseSwapEthInput(UniswapRouterV2__factory.createInterface().decodeFunctionData(this.getFunctionName(), tx.data));
    }
}

const logToFile = async (message: string) => {
    const filePath = './logs/';

    if (!fs.existsSync(filePath))
        fs.mkdirSync(filePath);

    var stream = fs.createWriteStream(filePath + "swapExactEthForTokens.log", { flags: 'a+' });
    stream.write(message);
    stream.end();
}