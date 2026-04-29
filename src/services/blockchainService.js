import { ethers } from "ethers";
import fs from "fs";
import path from "path";

let providerInstance = null;
let contractInstance = null;

const getRequiredEnv = (key) => {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value.trim();
};

const getProvider = () => {
  if (providerInstance) {
    return providerInstance;
  }

  const rpcUrl = getRequiredEnv("BLOCKCHAIN_RPC_URL");
  providerInstance = new ethers.JsonRpcProvider(rpcUrl);
  return providerInstance;
};

const getContract = () => {
  if (contractInstance) {
    return contractInstance;
  }

  const contractAddress = getRequiredEnv("BLOCKCHAIN_CONTRACT_ADDRESS");
  const privateKey = getRequiredEnv("BLOCKCHAIN_PRIVATE_KEY");
  const abiPath = process.env.BLOCKCHAIN_CONTRACT_ABI_PATH?.trim();
  const abiJsonFromEnv = process.env.BLOCKCHAIN_CONTRACT_ABI_JSON?.trim();

  let contractAbi;
  if (abiPath) {
    const resolvedPath = path.resolve(process.cwd(), abiPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`ABI 파일을 찾을 수 없습니다: ${resolvedPath}`);
    }
    const raw = fs.readFileSync(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw);
    contractAbi = Array.isArray(parsed) ? parsed : parsed.abi;
  } else if (abiJsonFromEnv) {
    try {
      contractAbi = JSON.parse(abiJsonFromEnv);
    } catch {
      throw new Error("BLOCKCHAIN_CONTRACT_ABI_JSON 파싱에 실패했습니다.");
    }
  } else {
    throw new Error("BLOCKCHAIN_CONTRACT_ABI_PATH 또는 BLOCKCHAIN_CONTRACT_ABI_JSON이 필요합니다.");
  }

  if (!Array.isArray(contractAbi)) {
    throw new Error("ABI 형식이 올바르지 않습니다. 배열(abi)이 필요합니다.");
  }

  const wallet = new ethers.Wallet(privateKey, getProvider());
  contractInstance = new ethers.Contract(contractAddress, contractAbi, wallet);
  return contractInstance;
};

const parseImageRegisteredEvent = (contract, receipt) => {
  if (!receipt?.logs?.length) {
    return null;
  }
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "ImageRegistered") {
        return parsed.args;
      }
    } catch {
      // ignore non-contract logs
    }
  }
  return null;
};

export const registerImageHashOnChain = async ({ imageHash, price, metadata = "" }) => {
  const expectedChainId = process.env.BLOCKCHAIN_CHAIN_ID
    ? Number.parseInt(process.env.BLOCKCHAIN_CHAIN_ID, 10)
    : null;
  const provider = getProvider();
  const network = await provider.getNetwork();
  if (expectedChainId && Number(network.chainId) !== expectedChainId) {
    throw new Error(
      `체인 ID가 일치하지 않습니다. expected=${expectedChainId}, actual=${network.chainId}`
    );
  }

  const contract = getContract();
  let tx;
  if (typeof contract.registerImage === "function") {
    tx = await contract.registerImage(String(imageHash), BigInt(price));
  } else if (typeof contract.registerImageHash === "function") {
    tx = await contract.registerImageHash(imageHash, String(metadata));
  } else {
    throw new Error(
      "컨트랙트에서 registerImage 또는 registerImageHash 함수를 찾지 못했습니다."
    );
  }
  const receipt = await tx.wait();
  const imageRegistered = parseImageRegisteredEvent(contract, receipt);

  return {
    txHash: tx.hash,
    verificationStatus: receipt?.status === 1 ? "VERIFIED" : "FAILED",
    chainEvent: imageRegistered
      ? {
          owner: imageRegistered.owner?.toString?.() ?? null,
          pHash: imageRegistered.pHash?.toString?.() ?? null,
          price: imageRegistered.price?.toString?.() ?? null,
          timestamp: imageRegistered.timestamp?.toString?.() ?? null,
        }
      : null,
  };
};
