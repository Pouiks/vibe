import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_123';

const stripeOptions: any = {};
// @ts-ignore
const stripe = new Stripe(stripeSecretKey, stripeOptions);

export async function POST(req: Request) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'VIBE Social Pass (Abonnement)',
              description: 'Création illimitée d\'événements Flash et badge vérifié.',
            },
            unit_amount: 499, // 4.99 €
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/profile?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/profile?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
