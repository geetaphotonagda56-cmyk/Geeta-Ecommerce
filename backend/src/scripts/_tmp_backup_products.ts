import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';

dotenv.config();

const ProductSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model('Product', ProductSchema);

const BACKUP_PATH = '/tmp/claude-1000/-home-thinkpad-code-Geeta-ecom/2d0e25eb-768b-4e32-916a-c58530d51151/scratchpad/products-backup-pre-variant-migration.json';

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const products = await Product.find({}).lean();
  console.log(`Fetched ${products.length} products`);

  fs.writeFileSync(BACKUP_PATH, JSON.stringify(products));
  const stats = fs.statSync(BACKUP_PATH);
  console.log(`Backup written to ${BACKUP_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  // Sanity check: re-read and count
  const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  console.log(`Verified: backup file contains ${parsed.length} product records`);

  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
