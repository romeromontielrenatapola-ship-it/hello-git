import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  public readonly client!: SupabaseClient;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        }
      });
    } else {
      // SSR Mock Client to prevent server build crashes
      this.client = {
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
          signInWithPassword: async () => ({ data: {}, error: null }),
          signUp: async () => ({ data: {}, error: null }),
          signOut: async () => ({ error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (cb: any) => cb({ data: [], error: null })
              }),
              single: () => ({
                then: (cb: any) => cb({ data: null, error: null })
              }),
              then: (cb: any) => cb({ data: [], error: null })
            }),
            single: () => ({
              then: (cb: any) => cb({ data: null, error: null })
            }),
            order: () => ({
              then: (cb: any) => cb({ data: [], error: null })
            }),
            then: (cb: any) => cb({ data: [], error: null })
          }),
          insert: () => ({
            select: () => ({
              single: () => ({
                then: (cb: any) => cb({ data: null, error: null })
              }),
              then: (cb: any) => cb({ data: [], error: null })
            }),
            then: (cb: any) => cb({ data: [], error: null })
          }),
          update: () => ({
            eq: () => ({
              then: (cb: any) => cb({ data: [], error: null })
            }),
            then: (cb: any) => cb({ data: [], error: null })
          }),
          delete: () => ({
            eq: () => ({
              then: (cb: any) => cb({ data: [], error: null })
            }),
            then: (cb: any) => cb({ data: [], error: null })
          })
        })
      } as any;
    }
  }
}
