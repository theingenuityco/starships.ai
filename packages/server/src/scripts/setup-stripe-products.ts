import Stripe from 'stripe';
import { SUBSCRIPTION_PLANS } from '../config/subscription-plans';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from root .env file
config({ path: resolve(__dirname, '../../../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function setupStripeProducts() {
  try {
    console.log('🚀 Setting up Starships.ai Subscription Plans in Stripe...\n');

    for (const [planKey, planConfig] of Object.entries(SUBSCRIPTION_PLANS)) {
      console.log(`⚙️  Setting up ${planKey} plan...`);
      
      // Check if product already exists by plan_type metadata
      const existingProducts = await stripe.products.list({
        limit: 100
      });
      
      let product = existingProducts.data.find(p => 
        p.metadata?.plan_type === planConfig.product.metadata.plan_type
      );
      
      if (product) {
        console.log(`⚡ Product already exists: ${product.id} (${product.name})`);
        
        // Update existing product with latest configuration (in case metadata changed)
        product = await stripe.products.update(product.id, {
          name: planConfig.product.name,
          description: planConfig.product.description,
          metadata: planConfig.product.metadata
        });
        console.log(`🔄 Product updated with latest configuration`);
      } else {
        // Create new product
        product = await stripe.products.create(planConfig.product);
        console.log(`✅ Product created: ${product.id} (${product.name})`);
      }
      
      // Handle prices
      for (const [interval, priceConfig] of Object.entries(planConfig.prices)) {
        const existingPrices = await stripe.prices.list({
          product: product.id,
          limit: 10
        });
        
        const priceExists = existingPrices.data.find(p => 
          p.recurring?.interval === priceConfig.interval
        );
        
        if (priceExists) {
          console.log(`⚡ Price already exists: ${priceExists.id} (${interval} - $${(priceExists.unit_amount || 0) / 100})`);
        } else {
          const price = await stripe.prices.create({
            product: product.id,
            currency: 'usd',
            unit_amount: priceConfig.amount,
            recurring: { interval: priceConfig.interval as 'month' | 'year' },
            nickname: `${planConfig.product.name} (${interval})`
          });
          console.log(`✅ Price created: ${price.id} (${interval} - $${priceConfig.amount / 100})`);
        }
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('🎉 All subscription plans are configured in Stripe!');
    console.log('\n📋 Final Summary:');
    
    // Display comprehensive summary with metadata
    const allProducts = await stripe.products.list({
      active: true,
      limit: 100
    });
    
    const ourProducts = allProducts.data.filter(p => p.metadata?.plan_type);
    
    for (const product of ourProducts) {
      console.log(`\n📦 ${product.name} (${product.id})`);
      console.log(`   Description: ${product.description}`);
      console.log(`   Metadata:`);
      Object.entries(product.metadata || {}).forEach(([key, value]) => {
        console.log(`     • ${key}: ${value}`);
      });
      
      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
        limit: 10
      });
      
      console.log(`   Pricing:`);
      for (const price of prices.data) {
        const amount = (price.unit_amount || 0) / 100;
        const interval = price.recurring?.interval || 'one-time';
        console.log(`     • $${amount}/${interval} (${price.id})`);
      }
    }
    
    console.log('\n🌐 View in Stripe Dashboard:');
    console.log('   • Go to: https://dashboard.stripe.com/test/products');
    console.log('   • Ensure you are in TEST mode');
    console.log('   • Click on any product to see metadata');
    
    console.log('\n✨ Setup complete! Your subscription system is ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error);
    process.exit(1);
  }
}

// Validation checks
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is not set!');
  console.error('Please add your Stripe secret key to the root .env file:');
  console.error('STRIPE_SECRET_KEY=sk_test_...');
  process.exit(1);
}

if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
  console.error('❌ Invalid STRIPE_SECRET_KEY format!');
  console.error('Stripe secret keys should start with "sk_test_" or "sk_live_"');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production' && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.warn('⚠️  WARNING: You are using a LIVE Stripe key in development!');
  console.warn('This will create products in your live Stripe account.');
  console.warn('Consider using a test key (sk_test_...) for development.');
}

// Run the setup
setupStripeProducts();