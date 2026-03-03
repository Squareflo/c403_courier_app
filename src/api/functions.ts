import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// Helper function to call Supabase Edge Functions
async function callEdgeFunction(functionName: string, body: any = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const options: any = { body };

    if (session?.access_token) {
      options.headers = { Authorization: `Bearer ${session.access_token}` };
    }

    const { data, error } = await supabase.functions.invoke(functionName, options);

    if (error) {
      console.error(`Edge function ${functionName} error:`, error);

      let responseData = data;
      let statusCode = 500;

      if (error instanceof FunctionsHttpError) {
        statusCode = (error as any).context?.status || 500;

        if (!responseData && (error as any).context && typeof (error as any).context.json === 'function') {
          try {
            const json = await (error as any).context.json();
            if (json) responseData = json;
          } catch {}
        }
      }

      const enhancedError: any = new Error(error.message || 'Edge Function error');
      enhancedError.response = {
        status: statusCode,
        data: responseData || { error: error.message },
      };
      if (responseData?.details) enhancedError.details = responseData.details;
      throw enhancedError;
    }

    return { data, status: 200 };
  } catch (error: any) {
    if (error.response) throw error;

    const wrappedError: any = new Error(error.message || `Failed to call ${functionName}`);
    wrappedError.response = { status: 500, data: { error: error.message } };
    throw wrappedError;
  }
}

// Auth functions
export const verifyEmail = (body: any) => callEdgeFunction('verify-email', body);
export const resendVerificationCode = (body: any) => callEdgeFunction('resend-verification-code', body);
export const registerCustomer = (body: any) => callEdgeFunction('register-customer', body);
export const requestPasswordReset = (body: any) => callEdgeFunction('request-password-reset', body);
export const verifyResetCode = (body: any) => callEdgeFunction('verify-reset-code', body);
export const verifyResetCodeAndSetPassword = (body: any) =>
  callEdgeFunction('verify-reset-code-and-set-password', body);
