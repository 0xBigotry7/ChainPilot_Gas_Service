"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    },
    hasReceivedGas: {
        type: Boolean,
        default: false,
    },
    gasFundingTxHash: {
        type: String,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});
userSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});
exports.User = mongoose_1.default.model('User', userSchema);
