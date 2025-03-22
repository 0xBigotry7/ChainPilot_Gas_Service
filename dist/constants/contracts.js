"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USDC_ABI = void 0;
// USDC ABI - only including the events and functions we need
exports.USDC_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];
