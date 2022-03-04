import { signer } from "../../constants";
import { BigNumber, Overrides, PayableOverrides } from "ethers";
import { FrUnit } from '../../out/typechain/FrUnit';
import { UniswapRouterV2 } from '../../out/typechain/UniswapRouterV2';
import bn from "bignumber.js";

export class SwapV2Service {
    private _unit: FrUnit;

    public get unit(): FrUnit {
        return this._unit;
    }

    private router: UniswapRouterV2;

    public readonly BASE_POINTS: number = 10000;

    constructor(unit: FrUnit, swapRouter: UniswapRouterV2) {
        this._unit = unit;
        this.router = swapRouter;
    }

    public async getAmountsIn(
        amountOut: BigNumber,
        path: string[]
    ) {
        return (await this.router.getAmountsOut(
            amountOut,
            path
        ));
    }

    public async getAmountsOut(
        amountIn: BigNumber,
        path: string[]
    ) {
        return (await this.router.getAmountsOut(
            amountIn,
            path
        ));
    }

    public async calculateMaxETHToSend(
        amountOutMin: BigNumber,
        amountsOut: BigNumber[],
        path: string[]
    ): Promise<BigNumber> {
        if (path.length != amountsOut.length) throw new Error("Path and amountsOut lengths are not equal");

        const tokenA = path[path.length - 2];
        const tokenB = path[path.length - 1];

        const { reserveA, reserveB } = await this.unit.callStatic.getReservesV2(this.router.address, tokenA, tokenB);

        const amountIn = amountsOut[path.length - 2];

        const res = this._calculateMaxTokenToSend(
            new bn(amountIn.toString()),
            new bn(amountOutMin.toString()),
            new bn(reserveA.toString()),
            new bn(reserveB.toString())
        )

        return (
            path.length > 2 ?
                (await this.getAmountsIn(BigNumber.from(res), path.slice(0, -1)))[0] :
                BigNumber.from(res));
    }

    private _calculateMaxTokenToSend(
        amountIn: bn,
        amountOutMin: bn,
        reserveA: bn,
        reserveB: bn
    ) {
        const a = amountIn;
        const b = amountIn.multipliedBy(amountOutMin).minus(amountIn.multipliedBy(reserveB).multipliedBy(2));
        const c = amountIn.multipliedBy(reserveB).multipliedBy(reserveB.minus(amountOutMin)).minus(reserveA.multipliedBy(reserveB).multipliedBy(amountOutMin));

        const desc = b.multipliedBy(b).minus(a.multipliedBy(c).multipliedBy(4));

        const y = b.multipliedBy(-1).minus(desc.sqrt()).div(a.multipliedBy(2));
        const x = reserveA.multipliedBy(reserveB).div(reserveB.minus(y)).minus(reserveA);

        return x.toFixed(0);
    }

    public async swapExactETHForTokens(
        amountEth: BigNumber,
        path: string[],
        amountOutMin: BigNumber,
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        return this.unit.swapExactEthForTokensUniV2(
            this.router.address,
            path,
            amountEth,
            amountOutMin,
            deadline,
            {
                ...overrides
            }
        )
    }

    public async swapExactTokensForETH(
        maxSlippage: number,
        path: string[],
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        return this.unit.swapExactTokensForEthUniV2(
            this.router.address,
            path,
            this.toBasePoints(maxSlippage),
            deadline,
            {
                ...overrides
            }
        )
    }

    public callStatic = {
        swapExactETHForTokens: async (
            amountEth: BigNumber,
            path: string[],
            maxSlippage: number,
            deadline: BigNumber,
        ) => {
            return this.unit.callStatic.swapExactEthForTokensUniV2(
                this.router.address,
                path,
                amountEth,
                this.toBasePoints(maxSlippage),
                deadline,
            )
        },

        swapExactTokensForETH: async (
            maxSlippage: number,
            path: string[],
            deadline: BigNumber,
        ) => {
            return this.unit.callStatic.swapExactTokensForEthUniV2(
                this.router.address,
                path,
                this.toBasePoints(maxSlippage),
                deadline,
            )
        }
    }


    private toBasePoints(val: number): BigNumber {
        return BigNumber.from(parseInt((val * this.BASE_POINTS).toString()));
    }
}