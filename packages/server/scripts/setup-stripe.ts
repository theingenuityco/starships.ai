import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

interface ProductConfig {
  name: string;
  description: string;
  metadata: {
    plan_type: string;
    max_agents: string;
  };
}

interface PriceConfig {
  amount: number;
  interval: 'month' | 'year';
  lookup_key: string;
}

const PRODUCTS: Record<string, ProductConfig> = {
  cruiser: {
    name: 'Cruiser Starship',
    description: 'Advanced starship with enhanced capabilities for growing teams',
    metadata: {
      plan_type: 'cruiser',
      max_agents: '5',
    },
  },
  draught: {
    name: 'Draught Starship',
    description: 'Enterprise-grade starship with unlimited potential',
    metadata: {
      plan_type: 'draught',
      max_agents: '10',
    },
  },
};

const PRICES: Record<string, PriceConfig> = {
  cruiser_monthly: {
    amount: 3000, // $30.00
    interval: 'month',
    lookup_key: 'cruiser_monthly',
  },
  cruiser_yearly: {
    amount: 36000, // $360.00
    interval: 'year',
    lookup_key: 'cruiser_yearly',
  },
  draught_monthly: {
    amount: 10000, // $100.00
    interval: 'month',
    lookup_key: 'draught_monthly',
  },
  draught_yearly: {
    amount: 120000, // $1,200.00
    interval: 'year',
    lookup_key: 'draught_yearly',
  },
};

async function setupStripe() {
  console.log('🚀 Starting Stripe setup...\n');

  const priceIds: Record<string, string> = {};

  try {
    // First, check if products already exist
    console.log('📦 Checking existing products...');
    const existingProducts = await stripe.products.list({ limit: 100, active: true });

    for (const [key, config] of Object.entries(PRODUCTS)) {
      let product = existingProducts.data.find((p) => p.metadata.plan_type === config.metadata.plan_type);

      if (product) {
        console.log(`✅ Product already exists: ${product.name} (${product.id})`);
      } else {
        console.log(`📝 Creating product: ${config.name}`);
        product = await stripe.products.create(config);
        console.log(`✅ Created product: ${product.name} (${product.id})`);
      }

      // Check/Create prices for this product
      const existingPrices = await stripe.prices.list({
        product: product.id,
        limit: 100,
      });

      // Monthly price
      const monthlyKey = `${key}_monthly`;
      const monthlyConfig = PRICES[monthlyKey];
      let monthlyPrice = existingPrices.data.find((p) => p.recurring?.interval === 'month');

      if (monthlyPrice) {
        console.log(`  💵 Monthly price exists: $${monthlyPrice.unit_amount! / 100}/month (${monthlyPrice.id})`);
      } else {
        console.log(`  📝 Creating monthly price: $${monthlyConfig.amount / 100}/month`);
        monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: monthlyConfig.amount,
          currency: 'usd',
          recurring: { interval: monthlyConfig.interval },
          lookup_key: monthlyConfig.lookup_key,
        });
        console.log(`  ✅ Created monthly price: ${monthlyPrice.id}`);
      }
      priceIds[`STRIPE_PRICE_${key.toUpperCase()}_MONTHLY`] = monthlyPrice.id;

      // Yearly price
      const yearlyKey = `${key}_yearly`;
      const yearlyConfig = PRICES[yearlyKey];
      let yearlyPrice = existingPrices.data.find((p) => p.recurring?.interval === 'year');

      if (yearlyPrice) {
        console.log(`  💵 Yearly price exists: $${yearlyPrice.unit_amount! / 100}/year (${yearlyPrice.id})`);
      } else {
        console.log(`  📝 Creating yearly price: $${yearlyConfig.amount / 100}/year`);
        yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: yearlyConfig.amount,
          currency: 'usd',
          recurring: { interval: yearlyConfig.interval },
          lookup_key: yearlyConfig.lookup_key,
        });
        console.log(`  ✅ Created yearly price: ${yearlyPrice.id}`);
      }
      priceIds[`STRIPE_PRICE_${key.toUpperCase()}_YEARLY`] = yearlyPrice.id;

      console.log('');
    }

    // Update .env file with price IDs
    console.log('\n📄 Updating .env file with price IDs...');
    const envPath = path.resolve(__dirname, '../../../.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    for (const [key, value] of Object.entries(priceIds)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated .env file with price IDs');

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('✨ Stripe setup completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('  Products created: 2 (Cruiser, Draught)');
    console.log('  Prices created: 4 (2 monthly, 2 yearly)');
    console.log('\n💡 Next steps:');
    console.log('  1. Set up webhook endpoint in Stripe Dashboard');
    console.log('  2. Add STRIPE_WEBHOOK_SECRET to .env');
    console.log('  3. Run database migrations');
    console.log('  4. Start implementing subscription service');
    console.log('\n🔑 Price IDs have been saved to .env:');
    for (const [key, value] of Object.entries(priceIds)) {
      console.log(`  ${key}=${value}`);
    }
  } catch (error) {
    console.error('\n❌ Error during setup:', error);
    process.exit(1);
  }
}

// Run the setup
setupStripe().catch(console.error);
