import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';

dotenv.config();

const ProductSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model('Product', ProductSchema);

const BACKUP_PATH = '/tmp/claude-1000/-home-thinkpad-code-Geeta-ecom/2d0e25eb-768b-4e32-916a-c58530d51151/scratchpad/products-backup-pre-variant-migration.json';
const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
  const products: any[] = JSON.parse(raw);
  console.log(`Loaded ${products.length} products from backup (dryRun=${DRY_RUN})`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  let restored = 0;
  for (const p of products) {
    const { _id, ...rest } = p;
    if (!DRY_RUN) {
      await Product.replaceOne({ _id }, rest, { upsert: true });
    }
    restored++;
    if (restored % 1000 === 0) console.log(`...${restored}`);
  }
  console.log(`Restore complete: ${restored} products ${DRY_RUN ? 'would be' : 'were'} replaced.`);

  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
