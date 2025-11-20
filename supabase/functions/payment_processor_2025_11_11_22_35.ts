import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, userId, planName, amount } = await req.json()

    console.log(`Payment request: ${action} for user ${userId}`)

    let result = {}

    switch (action) {
      case 'check_subscription':
        result = await checkSubscription(supabaseClient, userId)
        break
      case 'create_payment':
        result = await createPayment(supabaseClient, userId, planName, amount)
        break
      case 'activate_subscription':
        result = await activateSubscription(supabaseClient, userId, planName)
        break
      default:
        throw new Error(`Unknown payment action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Payment processor error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function checkSubscription(supabaseClient: any, userId: string) {
  const { data: subscription } = await supabaseClient
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!subscription) {
    return {
      success: true,
      hasSubscription: false,
      plan: null
    }
  }

  const isActive = new Date(subscription.expires_at) > new Date()

  return {
    success: true,
    hasSubscription: isActive,
    plan: subscription.plan_name,
    expiresAt: subscription.expires_at
  }
}

async function createPayment(supabaseClient: any, userId: string, planName: string, amount: number) {
  // Здесь будет интеграция с платежной системой (Plisio/Stripe)
  return {
    success: true,
    paymentUrl: `https://payment.example.com/pay?amount=${amount}&plan=${planName}`,
    paymentId: `payment_${Date.now()}`
  }
}

async function activateSubscription(supabaseClient: any, userId: string, planName: string) {
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1) // 1 месяц

  const { error } = await supabaseClient
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_name: planName,
      expires_at: expiresAt.toISOString(),
      is_active: true
    })

  if (error) throw error

  return {
    success: true,
    message: 'Subscription activated successfully',
    expiresAt: expiresAt.toISOString()
  }
}
