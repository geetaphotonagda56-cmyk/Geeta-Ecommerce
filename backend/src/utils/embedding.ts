const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

type FeatureExtractionPipeline = (
  text: string,
  options?: { pooling?: "mean"; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let extractor: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

const importTransformers = async () => {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<any>;
  return dynamicImport("@xenova/transformers");
};

export const normalizeVector = (vector: number[]): number[] => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => value / magnitude);
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const loadModel = async (): Promise<FeatureExtractionPipeline> => {
  if (extractor) return extractor;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log(`[Embedding] Loading ${MODEL_ID}...`);
      const { pipeline, env } = await importTransformers();

      env.allowRemoteModels = process.env.HF_ALLOW_REMOTE_MODELS !== "false";
      env.allowLocalModels = process.env.HF_ALLOW_LOCAL_MODELS === "true";
      if (process.env.TRANSFORMERS_CACHE) {
        env.cacheDir = process.env.TRANSFORMERS_CACHE;
      }

      const model = (await pipeline("feature-extraction", MODEL_ID, {
        quantized: process.env.SEARCH_EMBEDDING_QUANTIZED !== "false",
      })) as FeatureExtractionPipeline;

      extractor = model;
      console.log(`[Embedding] ${MODEL_ID} initialized`);
      return model;
    } catch (error) {
      loadingPromise = null;
      console.error("[Embedding] Failed to initialize embedding model", error);
      throw error;
    }
  })();

  return loadingPromise;
};

export const generateEmbedding = async (text: string, timeoutMs = 8000): Promise<number[]> => {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  try {
    const model = await withTimeout(loadModel(), timeoutMs, "Embedding model load");
    const output = await withTimeout(
      model(normalizedText, { pooling: "mean", normalize: false }),
      timeoutMs,
      "Embedding inference"
    );
    return normalizeVector(Array.from(output.data));
  } catch (error) {
    console.error("[Embedding] Failed to generate embedding", error);
    throw error;
  }
};
