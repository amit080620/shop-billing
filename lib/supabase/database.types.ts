export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      shops: {
        Row: {
          id: string;
          name: string;
          legal_name: string | null;
          gstin: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          state_code: string | null;
          pincode: string | null;
          gst_scheme: "regular" | "composition";
          invoice_prefix: string;
          logo_url: string | null;
          upi_id: string | null;
          subscription_valid_until: string | null;
          wallet_balance: number;
          business_type: string;
          business_type_locked: boolean;
          manager_pin: string | null;
          enabled_modules: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          legal_name?: string | null;
          gstin?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          state_code?: string | null;
          pincode?: string | null;
          gst_scheme?: "regular" | "composition";
          invoice_prefix?: string;
          logo_url?: string | null;
          upi_id?: string | null;
          subscription_valid_until?: string | null;
          wallet_balance?: number;
          business_type?: string;
          business_type_locked?: boolean;
          manager_pin?: string | null;
          enabled_modules?: string[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          legal_name?: string | null;
          gstin?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          state_code?: string | null;
          pincode?: string | null;
          gst_scheme?: "regular" | "composition";
          invoice_prefix?: string;
          logo_url?: string | null;
          upi_id?: string | null;
          subscription_valid_until?: string | null;
          wallet_balance?: number;
          business_type?: string;
          business_type_locked?: boolean;
          manager_pin?: string | null;
          enabled_modules?: string[] | null;
          created_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "manager" | "staff";
          permissions: string[];
          branch_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "manager" | "staff";
          permissions?: string[];
          branch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          role?: "owner" | "manager" | "staff";
          permissions?: string[];
          branch_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "staff_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      categories: {
        Row: { id: string; shop_id: string; name: string; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "categories_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      products: {
        Row: {
          id: string;
          shop_id: string;
          category_id: string | null;
          name: string;
          hsn_code: string | null;
          unit: string;
          track_inventory: boolean;
          stock_quantity: number;
          low_stock_threshold: number;
          barcode: string | null;
          price: number;
          gst_percent: number;
          is_rentable: boolean;
          rental_rate_hourly: number | null;
          rental_rate_daily: number | null;
          rental_rate_weekly: number | null;
          rental_rate_monthly: number | null;
          security_deposit: number;
          is_pharma: boolean;
          requires_prescription: boolean;
          salt_composition: string | null;
          rack_location: string | null;
          drug_schedule: string | null;
          units_per_pack: number | null;
          loose_unit_name: string | null;
          has_warranty: boolean;
          warranty_months: number | null;
          mrp: number | null;
          metal_type: "gold" | "silver" | null;
          purity: string | null;
          making_charge_type: "per_gram" | "flat" | "percent" | null;
          making_charge_value: number | null;
          wastage_percent: number | null;
          bulk_min_qty: number | null;
          bulk_price: number | null;
          hallmark_number: string | null;
          image_url: string | null;
          offer_price: number | null;
          offer_label: string | null;
          show_in_catalog: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          category_id?: string | null;
          name: string;
          hsn_code?: string | null;
          unit?: string;
          track_inventory?: boolean;
          stock_quantity?: number;
          low_stock_threshold?: number;
          barcode?: string | null;
          price?: number;
          gst_percent?: number;
          is_rentable?: boolean;
          rental_rate_hourly?: number | null;
          rental_rate_daily?: number | null;
          rental_rate_weekly?: number | null;
          rental_rate_monthly?: number | null;
          security_deposit?: number;
          is_pharma?: boolean;
          requires_prescription?: boolean;
          salt_composition?: string | null;
          rack_location?: string | null;
          drug_schedule?: string | null;
          units_per_pack?: number | null;
          loose_unit_name?: string | null;
          has_warranty?: boolean;
          warranty_months?: number | null;
          mrp?: number | null;
          metal_type?: "gold" | "silver" | null;
          purity?: string | null;
          making_charge_type?: "per_gram" | "flat" | "percent" | null;
          making_charge_value?: number | null;
          wastage_percent?: number | null;
          bulk_min_qty?: number | null;
          bulk_price?: number | null;
          hallmark_number?: string | null;
          image_url?: string | null;
          offer_price?: number | null;
          offer_label?: string | null;
          show_in_catalog?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          category_id?: string | null;
          name?: string;
          hsn_code?: string | null;
          unit?: string;
          track_inventory?: boolean;
          stock_quantity?: number;
          low_stock_threshold?: number;
          barcode?: string | null;
          price?: number;
          gst_percent?: number;
          is_rentable?: boolean;
          rental_rate_hourly?: number | null;
          rental_rate_daily?: number | null;
          rental_rate_weekly?: number | null;
          rental_rate_monthly?: number | null;
          security_deposit?: number;
          is_pharma?: boolean;
          requires_prescription?: boolean;
          salt_composition?: string | null;
          rack_location?: string | null;
          drug_schedule?: string | null;
          units_per_pack?: number | null;
          loose_unit_name?: string | null;
          has_warranty?: boolean;
          warranty_months?: number | null;
          mrp?: number | null;
          metal_type?: "gold" | "silver" | null;
          purity?: string | null;
          making_charge_type?: "per_gram" | "flat" | "percent" | null;
          making_charge_value?: number | null;
          wastage_percent?: number | null;
          bulk_min_qty?: number | null;
          bulk_price?: number | null;
          hallmark_number?: string | null;
          image_url?: string | null;
          offer_price?: number | null;
          offer_label?: string | null;
          show_in_catalog?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "products_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "products_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
        ];
      };
      customers: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          phone: string;
          gstin: string | null;
          address: string | null;
          state: string | null;
          state_code: string | null;
          date_of_birth: string | null;
          gender: "male" | "female" | "other" | null;
          blood_group: string | null;
          known_allergies: string | null;
          assigned_trainer_id: string | null;
          fitness_goal: string | null;
          height_cm: number | null;
          weight_kg: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          phone: string;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          date_of_birth?: string | null;
          gender?: "male" | "female" | "other" | null;
          blood_group?: string | null;
          known_allergies?: string | null;
          assigned_trainer_id?: string | null;
          fitness_goal?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          phone?: string;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          date_of_birth?: string | null;
          gender?: "male" | "female" | "other" | null;
          blood_group?: string | null;
          known_allergies?: string | null;
          assigned_trainer_id?: string | null;
          fitness_goal?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "customers_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "customers_assigned_trainer_id_fkey"; columns: ["assigned_trainer_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      invoice_counters: {
        Row: { shop_id: string; financial_year: string; next_number: number };
        Insert: { shop_id: string; financial_year: string; next_number?: number };
        Update: { shop_id?: string; financial_year?: string; next_number?: number };
        Relationships: [];
      };
      bills: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          staff_id: string;
          invoice_number: string;
          financial_year: string;
          subtotal: number;
          discount_type: "percent" | "flat";
          discount_value: number;
          discount_amount: number;
          taxable_amount: number;
          supply_type: "intra" | "inter";
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          gst_amount: number;
          round_off_amount: number;
          payment_method: "cash" | "card" | "upi" | "online" | "other";
          status: "active" | "voided";
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          doctor_name: string | null;
          patient_name: string | null;
          service_provider_name: string | null;
          total: number;
          paid_amount: number;
          credit_amount: number;
          branch_id: string | null;
          edited_at: string | null;
          edited_by: string | null;
          edit_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          staff_id: string;
          invoice_number: string;
          financial_year: string;
          subtotal?: number;
          discount_type?: "percent" | "flat";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          round_off_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          status?: "active" | "voided";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          doctor_name?: string | null;
          patient_name?: string | null;
          service_provider_name?: string | null;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          branch_id?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          edit_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          staff_id?: string;
          invoice_number?: string;
          financial_year?: string;
          subtotal?: number;
          discount_type?: "percent" | "flat";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          round_off_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          status?: "active" | "voided";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          doctor_name?: string | null;
          patient_name?: string | null;
          service_provider_name?: string | null;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          branch_id?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          edit_reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "bills_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "bills_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "bills_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      bill_items: {
        Row: {
          id: string;
          bill_id: string;
          product_id: string | null;
          product_name: string;
          hsn_code: string | null;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_gst: number;
          line_total: number;
          batch_id: string | null;
          warranty_months: number | null;
          warranty_expires_on: string | null;
          mrp: number | null;
          hallmark_number: string | null;
        };
        Insert: {
          id?: string;
          bill_id: string;
          product_id?: string | null;
          product_name: string;
          hsn_code?: string | null;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          batch_id?: string | null;
          warranty_months?: number | null;
          warranty_expires_on?: string | null;
          mrp?: number | null;
          hallmark_number?: string | null;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total: number;
        };
        Update: {
          id?: string;
          bill_id?: string;
          product_id?: string | null;
          product_name?: string;
          hsn_code?: string | null;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total?: number;
          batch_id?: string | null;
        };
        Relationships: [
          { foreignKeyName: "bill_items_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "bill_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      payments: {
        Row: { id: string; shop_id: string; customer_id: string; staff_id: string; amount: number; payment_method: "cash" | "card" | "upi" | "online" | "other"; note: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; customer_id: string; staff_id: string; amount: number; payment_method?: "cash" | "card" | "upi" | "online" | "other"; note?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; customer_id?: string; staff_id?: string; amount?: number; payment_method?: "cash" | "card" | "upi" | "online" | "other"; note?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "payments_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      vendors: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          phone: string | null;
          gstin: string | null;
          address: string | null;
          state: string | null;
          state_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          phone?: string | null;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          phone?: string | null;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "vendors_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      purchases: {
        Row: {
          id: string;
          shop_id: string;
          vendor_id: string;
          staff_id: string;
          vendor_invoice_number: string;
          purchase_date: string;
          subtotal: number;
          taxable_amount: number;
          supply_type: "intra" | "inter";
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          gst_amount: number;
          total: number;
          paid_amount: number;
          payment_method: "cash" | "card" | "upi" | "online" | "other";
          payable_amount: number;
          itc_eligible: boolean;
          reverse_charge: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          vendor_id: string;
          staff_id: string;
          vendor_invoice_number: string;
          purchase_date?: string;
          subtotal?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          total?: number;
          paid_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          payable_amount?: number;
          itc_eligible?: boolean;
          reverse_charge?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          vendor_id?: string;
          staff_id?: string;
          vendor_invoice_number?: string;
          purchase_date?: string;
          subtotal?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          total?: number;
          paid_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          payable_amount?: number;
          itc_eligible?: boolean;
          reverse_charge?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "purchases_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: false; referencedRelation: "vendors"; referencedColumns: ["id"] },
        ];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          product_id: string | null;
          description: string;
          hsn_code: string | null;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_gst: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          product_id?: string | null;
          description: string;
          hsn_code?: string | null;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total: number;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          product_id?: string | null;
          description?: string;
          hsn_code?: string | null;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total?: number;
        };
        Relationships: [
          { foreignKeyName: "purchase_items_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      restaurant_reservations: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          party_size: number;
          reservation_date: string;
          reservation_time: string;
          table_preference: string | null;
          table_id: string | null;
          token_amount: number;
          refund_amount: number;
          refund_type: "none" | "partial" | "full" | null;
          status: "booked" | "confirmed" | "seated" | "cancelled" | "no_show";
          notes: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          party_size?: number;
          reservation_date: string;
          reservation_time: string;
          table_preference?: string | null;
          table_id?: string | null;
          token_amount?: number;
          refund_amount?: number;
          refund_type?: "none" | "partial" | "full" | null;
          status?: "booked" | "confirmed" | "seated" | "cancelled" | "no_show";
          notes?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          party_size?: number;
          reservation_date?: string;
          reservation_time?: string;
          table_preference?: string | null;
          table_id?: string | null;
          token_amount?: number;
          refund_amount?: number;
          refund_type?: "none" | "partial" | "full" | null;
          status?: "booked" | "confirmed" | "seated" | "cancelled" | "no_show";
          notes?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "restaurant_reservations_table_id_fkey"; columns: ["table_id"]; isOneToOne: false; referencedRelation: "restaurant_tables"; referencedColumns: ["id"] },
        ];
      };
      invoice_settings: {
        Row: { shop_id: string; tagline: string | null; footer_text: string | null; terms_and_conditions: string | null; bank_details: string | null; accent_color: string; header_image_url: string | null; footer_image_url: string | null; updated_at: string };
        Insert: { shop_id: string; tagline?: string | null; footer_text?: string | null; terms_and_conditions?: string | null; bank_details?: string | null; accent_color?: string; header_image_url?: string | null; footer_image_url?: string | null; updated_at?: string };
        Update: { shop_id?: string; tagline?: string | null; footer_text?: string | null; terms_and_conditions?: string | null; bank_details?: string | null; accent_color?: string; header_image_url?: string | null; footer_image_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      prescription_settings: {
        Row: { shop_id: string; header_text: string | null; footer_text: string | null; show_shop_logo: boolean; custom_field_labels: string[]; header_image_url: string | null; footer_image_url: string | null; specialty: "general" | "dental" | "cardiology" | "dermatology" | "physiotherapy" | "orthopedic" | "ent" | "gynecology" | "pediatric" | "psychiatry" | "ophthalmology"; updated_at: string };
        Insert: { shop_id: string; header_text?: string | null; footer_text?: string | null; show_shop_logo?: boolean; custom_field_labels?: string[]; header_image_url?: string | null; footer_image_url?: string | null; specialty?: "general" | "dental" | "cardiology" | "dermatology" | "physiotherapy" | "orthopedic" | "ent" | "gynecology" | "pediatric" | "psychiatry" | "ophthalmology"; updated_at?: string };
        Update: { shop_id?: string; header_text?: string | null; footer_text?: string | null; show_shop_logo?: boolean; custom_field_labels?: string[]; header_image_url?: string | null; footer_image_url?: string | null; specialty?: "general" | "dental" | "cardiology" | "dermatology" | "physiotherapy" | "orthopedic" | "ent" | "gynecology" | "pediatric" | "psychiatry" | "ophthalmology"; updated_at?: string };
        Relationships: [];
      };
      catalog_settings: {
        Row: { shop_id: string; is_enabled: boolean; public_token: string; banner_text: string | null; updated_at: string };
        Insert: { shop_id: string; is_enabled?: boolean; public_token?: string; banner_text?: string | null; updated_at?: string };
        Update: { shop_id?: string; is_enabled?: boolean; public_token?: string; banner_text?: string | null; updated_at?: string };
        Relationships: [];
      };
      catalog_order_requests: {
        Row: { id: string; shop_id: string; customer_name: string; customer_phone: string; notes: string | null; status: "pending" | "accepted" | "rejected"; bill_id: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; customer_name: string; customer_phone: string; notes?: string | null; status?: "pending" | "accepted" | "rejected"; bill_id?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; customer_name?: string; customer_phone?: string; notes?: string | null; status?: "pending" | "accepted" | "rejected"; bill_id?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "catalog_order_requests_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
        ];
      };
      catalog_order_request_items: {
        Row: { id: string; request_id: string; product_id: string | null; product_name: string; quantity: number; price_at_request: number };
        Insert: { id?: string; request_id: string; product_id?: string | null; product_name: string; quantity?: number; price_at_request: number };
        Update: { id?: string; request_id?: string; product_id?: string | null; product_name?: string; quantity?: number; price_at_request?: number };
        Relationships: [
          { foreignKeyName: "catalog_order_request_items_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "catalog_order_requests"; referencedColumns: ["id"] },
        ];
      };
      booking_settings: {
        Row: { shop_id: string; slot_duration_minutes: number; working_hours: Record<string, { start: string; end: string }[]>; is_public_booking_enabled: boolean; public_token: string; doctor_name: string | null; doctor_qualifications: string | null; doctor_photo_url: string | null; unavailable_dates: string[]; updated_at: string };
        Insert: { shop_id: string; slot_duration_minutes?: number; working_hours?: Record<string, { start: string; end: string }[]>; is_public_booking_enabled?: boolean; public_token?: string; doctor_name?: string | null; doctor_qualifications?: string | null; doctor_photo_url?: string | null; unavailable_dates?: string[]; updated_at?: string };
        Update: { shop_id?: string; slot_duration_minutes?: number; working_hours?: Record<string, { start: string; end: string }[]>; is_public_booking_enabled?: boolean; public_token?: string; doctor_name?: string | null; doctor_qualifications?: string | null; doctor_photo_url?: string | null; unavailable_dates?: string[]; updated_at?: string };
        Relationships: [];
      };
      clinic_appointments: {
        Row: {
          id: string;
          shop_id: string;
          patient_id: string | null;
          patient_name: string;
          patient_phone: string;
          reason_for_visit: string | null;
          appointment_date: string;
          appointment_time: string;
          status: "booked" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show";
          doctor_name: string | null;
          notes: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          patient_id?: string | null;
          patient_name: string;
          patient_phone: string;
          reason_for_visit?: string | null;
          appointment_date: string;
          appointment_time: string;
          status?: "booked" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show";
          doctor_name?: string | null;
          notes?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          patient_id?: string | null;
          patient_name?: string;
          patient_phone?: string;
          reason_for_visit?: string | null;
          appointment_date?: string;
          appointment_time?: string;
          status?: "booked" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show";
          doctor_name?: string | null;
          notes?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      prescription_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      kds_settings: {
        Row: { shop_id: string; columns: number; font_scale: "normal" | "large" | "extra_large"; updated_at: string };
        Insert: { shop_id: string; columns?: number; font_scale?: "normal" | "large" | "extra_large"; updated_at?: string };
        Update: { shop_id?: string; columns?: number; font_scale?: "normal" | "large" | "extra_large"; updated_at?: string };
        Relationships: [];
      };
      gym_kiosk_settings: {
        Row: { shop_id: string; is_enabled: boolean; public_token: string; updated_at: string };
        Insert: { shop_id: string; is_enabled?: boolean; public_token?: string; updated_at?: string };
        Update: { shop_id?: string; is_enabled?: boolean; public_token?: string; updated_at?: string };
        Relationships: [];
      };
      gym_classes: {
        Row: { id: string; shop_id: string; name: string; trainer_id: string | null; day_of_week: number; start_time: string; duration_minutes: number; capacity: number; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; trainer_id?: string | null; day_of_week: number; start_time: string; duration_minutes?: number; capacity?: number; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; trainer_id?: string | null; day_of_week?: number; start_time?: string; duration_minutes?: number; capacity?: number; is_active?: boolean; created_at?: string };
        Relationships: [
          { foreignKeyName: "gym_classes_trainer_id_fkey"; columns: ["trainer_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      gym_class_bookings: {
        Row: { id: string; class_id: string; member_id: string; class_date: string; created_at: string };
        Insert: { id?: string; class_id: string; member_id: string; class_date: string; created_at?: string };
        Update: { id?: string; class_id?: string; member_id?: string; class_date?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "gym_class_bookings_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "gym_classes"; referencedColumns: ["id"] },
          { foreignKeyName: "gym_class_bookings_member_id_fkey"; columns: ["member_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      lab_tests: {
        Row: { id: string; shop_id: string; name: string; category: string | null; sample_type: "blood" | "urine" | "stool" | "swab" | "other"; price: number; gst_percent: number; turnaround_hours: number; reference_range: string | null; unit: string | null; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; category?: string | null; sample_type?: "blood" | "urine" | "stool" | "swab" | "other"; price: number; gst_percent?: number; turnaround_hours?: number; reference_range?: string | null; unit?: string | null; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; category?: string | null; sample_type?: "blood" | "urine" | "stool" | "swab" | "other"; price?: number; gst_percent?: number; turnaround_hours?: number; reference_range?: string | null; unit?: string | null; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      lab_packages: {
        Row: { id: string; shop_id: string; name: string; price: number; gst_percent: number; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; price: number; gst_percent?: number; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; price?: number; gst_percent?: number; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      lab_package_tests: {
        Row: { id: string; package_id: string; test_id: string };
        Insert: { id?: string; package_id: string; test_id: string };
        Update: { id?: string; package_id?: string; test_id?: string };
        Relationships: [
          { foreignKeyName: "lab_package_tests_package_id_fkey"; columns: ["package_id"]; isOneToOne: false; referencedRelation: "lab_packages"; referencedColumns: ["id"] },
          { foreignKeyName: "lab_package_tests_test_id_fkey"; columns: ["test_id"]; isOneToOne: false; referencedRelation: "lab_tests"; referencedColumns: ["id"] },
        ];
      };
      lab_orders: {
        Row: {
          id: string;
          shop_id: string;
          order_number: string;
          financial_year: string;
          patient_id: string | null;
          patient_name: string;
          patient_phone: string;
          patient_age: string | null;
          patient_gender: "male" | "female" | "other" | null;
          referring_doctor_name: string | null;
          collection_type: "walk_in" | "home_collection";
          home_address: string | null;
          collection_slot: string | null;
          phlebotomist_id: string | null;
          status: "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled";
          bill_id: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          order_number: string;
          financial_year: string;
          patient_id?: string | null;
          patient_name: string;
          patient_phone: string;
          patient_age?: string | null;
          patient_gender?: "male" | "female" | "other" | null;
          referring_doctor_name?: string | null;
          collection_type?: "walk_in" | "home_collection";
          home_address?: string | null;
          collection_slot?: string | null;
          phlebotomist_id?: string | null;
          status?: "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled";
          bill_id?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          order_number?: string;
          financial_year?: string;
          patient_id?: string | null;
          patient_name?: string;
          patient_phone?: string;
          patient_age?: string | null;
          patient_gender?: "male" | "female" | "other" | null;
          referring_doctor_name?: string | null;
          collection_type?: "walk_in" | "home_collection";
          home_address?: string | null;
          collection_slot?: string | null;
          phlebotomist_id?: string | null;
          status?: "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled";
          bill_id?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "lab_orders_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "lab_orders_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "lab_orders_phlebotomist_id_fkey"; columns: ["phlebotomist_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      lab_order_items: {
        Row: { id: string; order_id: string; test_id: string | null; test_name: string; reference_range: string | null; unit: string | null; result_value: string | null; result_flag: "normal" | "high" | "low" | null; price: number; gst_percent: number };
        Insert: { id?: string; order_id: string; test_id?: string | null; test_name: string; reference_range?: string | null; unit?: string | null; result_value?: string | null; result_flag?: "normal" | "high" | "low" | null; price: number; gst_percent?: number };
        Update: { id?: string; order_id?: string; test_id?: string | null; test_name?: string; reference_range?: string | null; unit?: string | null; result_value?: string | null; result_flag?: "normal" | "high" | "low" | null; price?: number; gst_percent?: number };
        Relationships: [
          { foreignKeyName: "lab_order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "lab_orders"; referencedColumns: ["id"] },
        ];
      };
      lab_order_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      audit_logs: {
        Row: { id: string; shop_id: string; staff_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown> | null; created_at: string };
        Insert: { id?: string; shop_id: string; staff_id?: string | null; action: string; entity_type: string; entity_id?: string | null; details?: Record<string, unknown> | null; created_at?: string };
        Update: { id?: string; shop_id?: string; staff_id?: string | null; action?: string; entity_type?: string; entity_id?: string | null; details?: Record<string, unknown> | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "audit_logs_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      password_reset_requests: {
        Row: { id: string; email: string; created_at: string };
        Insert: { id?: string; email: string; created_at?: string };
        Update: { id?: string; email?: string; created_at?: string };
        Relationships: [];
      };
      login_attempts: {
        Row: { id: string; email: string; succeeded: boolean; created_at: string };
        Insert: { id?: string; email: string; succeeded?: boolean; created_at?: string };
        Update: { id?: string; email?: string; succeeded?: boolean; created_at?: string };
        Relationships: [];
      };
      background_jobs: {
        Row: { id: string; shop_id: string; job_type: string; status: "processing" | "completed" | "failed"; total_rows: number; processed_rows: number; result: Record<string, unknown> | null; error: string | null; staff_id: string; created_at: string; completed_at: string | null };
        Insert: { id?: string; shop_id: string; job_type: string; status?: "processing" | "completed" | "failed"; total_rows?: number; processed_rows?: number; result?: Record<string, unknown> | null; error?: string | null; staff_id: string; created_at?: string; completed_at?: string | null };
        Update: { id?: string; shop_id?: string; job_type?: string; status?: "processing" | "completed" | "failed"; total_rows?: number; processed_rows?: number; result?: Record<string, unknown> | null; error?: string | null; staff_id?: string; created_at?: string; completed_at?: string | null };
        Relationships: [];
      };
      error_logs: {
        Row: { id: string; shop_id: string | null; context: string; message: string; details: Record<string, unknown> | null; created_at: string };
        Insert: { id?: string; shop_id?: string | null; context: string; message: string; details?: Record<string, unknown> | null; created_at?: string };
        Update: { id?: string; shop_id?: string | null; context?: string; message?: string; details?: Record<string, unknown> | null; created_at?: string };
        Relationships: [];
      };
      schema_migrations: {
        Row: { version: string; applied_at: string };
        Insert: { version: string; applied_at?: string };
        Update: { version?: string; applied_at?: string };
        Relationships: [];
      };
      signup_attempts: {
        Row: { id: string; ip_address: string; created_at: string };
        Insert: { id?: string; ip_address: string; created_at?: string };
        Update: { id?: string; ip_address?: string; created_at?: string };
        Relationships: [];
      };
      leads: {
        Row: { id: string; shop_id: string; name: string; phone: string; source: string | null; interested_plan: string | null; status: "new" | "contacted" | "trial" | "converted" | "lost"; notes: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; phone: string; source?: string | null; interested_plan?: string | null; status?: "new" | "contacted" | "trial" | "converted" | "lost"; notes?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; phone?: string; source?: string | null; interested_plan?: string | null; status?: "new" | "contacted" | "trial" | "converted" | "lost"; notes?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      workout_plans: {
        Row: { id: string; shop_id: string; member_id: string; title: string; notes: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; member_id: string; title: string; notes?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; member_id?: string; title?: string; notes?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      workout_exercises: {
        Row: { id: string; plan_id: string; muscle_group: string | null; exercise_name: string; sets: number | null; reps: string | null; rest_seconds: number | null; sort_order: number };
        Insert: { id?: string; plan_id: string; muscle_group?: string | null; exercise_name: string; sets?: number | null; reps?: string | null; rest_seconds?: number | null; sort_order?: number };
        Update: { id?: string; plan_id?: string; muscle_group?: string | null; exercise_name?: string; sets?: number | null; reps?: string | null; rest_seconds?: number | null; sort_order?: number };
        Relationships: [
          { foreignKeyName: "workout_exercises_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "workout_plans"; referencedColumns: ["id"] },
        ];
      };
      diet_plans: {
        Row: { id: string; shop_id: string; member_id: string; goal: string | null; notes: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; member_id: string; goal?: string | null; notes?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; member_id?: string; goal?: string | null; notes?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      diet_meals: {
        Row: { id: string; plan_id: string; meal_slot: "breakfast" | "mid_morning" | "lunch" | "evening" | "dinner" | "post_workout"; food_items: string; calories: number | null; sort_order: number };
        Insert: { id?: string; plan_id: string; meal_slot: "breakfast" | "mid_morning" | "lunch" | "evening" | "dinner" | "post_workout"; food_items: string; calories?: number | null; sort_order?: number };
        Update: { id?: string; plan_id?: string; meal_slot?: "breakfast" | "mid_morning" | "lunch" | "evening" | "dinner" | "post_workout"; food_items?: string; calories?: number | null; sort_order?: number };
        Relationships: [
          { foreignKeyName: "diet_meals_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "diet_plans"; referencedColumns: ["id"] },
        ];
      };
      growth_logs: {
        Row: { id: string; shop_id: string; patient_id: string; height_cm: number | null; weight_kg: number | null; head_circumference_cm: number | null; note: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; patient_id: string; height_cm?: number | null; weight_kg?: number | null; head_circumference_cm?: number | null; note?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; patient_id?: string; height_cm?: number | null; weight_kg?: number | null; head_circumference_cm?: number | null; note?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      patient_photos: {
        Row: { id: string; shop_id: string; patient_id: string; photo_url: string; label: "before" | "after" | "other"; note: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; patient_id: string; photo_url: string; label?: "before" | "after" | "other"; note?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; patient_id?: string; photo_url?: string; label?: "before" | "after" | "other"; note?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      progress_logs: {
        Row: { id: string; shop_id: string; member_id: string; weight_kg: number | null; body_fat_percent: number | null; note: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; member_id: string; weight_kg?: number | null; body_fat_percent?: number | null; note?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; member_id?: string; weight_kg?: number | null; body_fat_percent?: number | null; note?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      membership_plans: {
        Row: { id: string; shop_id: string; name: string; duration_days: number; price: number; pt_sessions_included: number; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; duration_days: number; price: number; pt_sessions_included?: number; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; duration_days?: number; price?: number; pt_sessions_included?: number; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          shop_id: string;
          member_id: string;
          plan_id: string | null;
          plan_name: string;
          start_date: string;
          end_date: string;
          status: "active" | "frozen" | "cancelled" | "expired";
          pt_sessions_total: number;
          pt_sessions_used: number;
          bill_id: string | null;
          frozen_days_used: number;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          member_id: string;
          plan_id?: string | null;
          plan_name: string;
          start_date: string;
          end_date: string;
          status?: "active" | "frozen" | "cancelled" | "expired";
          pt_sessions_total?: number;
          pt_sessions_used?: number;
          bill_id?: string | null;
          frozen_days_used?: number;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          member_id?: string;
          plan_id?: string | null;
          plan_name?: string;
          start_date?: string;
          end_date?: string;
          status?: "active" | "frozen" | "cancelled" | "expired";
          pt_sessions_total?: number;
          pt_sessions_used?: number;
          bill_id?: string | null;
          frozen_days_used?: number;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "memberships_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "memberships_member_id_fkey"; columns: ["member_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      gym_attendance: {
        Row: { id: string; shop_id: string; member_id: string; checked_in_at: string; checked_out_at: string | null };
        Insert: { id?: string; shop_id: string; member_id: string; checked_in_at?: string; checked_out_at?: string | null };
        Update: { id?: string; shop_id?: string; member_id?: string; checked_in_at?: string; checked_out_at?: string | null };
        Relationships: [
          { foreignKeyName: "gym_attendance_member_id_fkey"; columns: ["member_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      branches: {
        Row: { id: string; shop_id: string; name: string; address: string | null; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; address?: string | null; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; address?: string | null; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      petty_cash_entries: {
        Row: { id: string; shop_id: string; description: string; amount: number; category: string | null; staff_id: string; created_at: string };
        Insert: { id?: string; shop_id: string; description: string; amount: number; category?: string | null; staff_id: string; created_at?: string };
        Update: { id?: string; shop_id?: string; description?: string; amount?: number; category?: string | null; staff_id?: string; created_at?: string };
        Relationships: [];
      };
      prescriptions: {
        Row: {
          id: string;
          shop_id: string;
          prescription_number: string;
          financial_year: string;
          appointment_id: string | null;
          patient_id: string | null;
          patient_name: string;
          patient_age: string | null;
          patient_gender: string | null;
          patient_phone: string | null;
          doctor_name: string | null;
          custom_sections: { label: string; value: string }[];
          follow_up_date: string | null;
          dental_chart: Record<string, string> | null;
          vitals: Record<string, string | number> | null;
          bill_id: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          prescription_number: string;
          financial_year: string;
          appointment_id?: string | null;
          patient_id?: string | null;
          patient_name: string;
          patient_age?: string | null;
          patient_gender?: string | null;
          patient_phone?: string | null;
          doctor_name?: string | null;
          custom_sections?: { label: string; value: string }[];
          follow_up_date?: string | null;
          dental_chart?: Record<string, string> | null;
          vitals?: Record<string, string | number> | null;
          bill_id?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          prescription_number?: string;
          financial_year?: string;
          appointment_id?: string | null;
          patient_id?: string | null;
          patient_name?: string;
          patient_age?: string | null;
          patient_gender?: string | null;
          patient_phone?: string | null;
          doctor_name?: string | null;
          custom_sections?: { label: string; value: string }[];
          follow_up_date?: string | null;
          dental_chart?: Record<string, string> | null;
          vitals?: Record<string, string | number> | null;
          bill_id?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "prescriptions_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "prescriptions_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      prescription_items: {
        Row: { id: string; prescription_id: string; medicine_name: string; dosage: string | null; frequency: string | null; duration: string | null; instructions: string | null; quantity: number | null; sort_order: number };
        Insert: { id?: string; prescription_id: string; medicine_name: string; dosage?: string | null; frequency?: string | null; duration?: string | null; instructions?: string | null; quantity?: number | null; sort_order?: number };
        Update: { id?: string; prescription_id?: string; medicine_name?: string; dosage?: string | null; frequency?: string | null; duration?: string | null; instructions?: string | null; quantity?: number | null; sort_order?: number };
        Relationships: [
          { foreignKeyName: "prescription_items_prescription_id_fkey"; columns: ["prescription_id"]; isOneToOne: false; referencedRelation: "prescriptions"; referencedColumns: ["id"] },
        ];
      };
      appointments: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          service_name: string;
          stylist_name: string | null;
          appointment_date: string;
          appointment_time: string;
          status: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";
          notes: string | null;
          bill_id: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          service_name: string;
          stylist_name?: string | null;
          appointment_date: string;
          appointment_time: string;
          status?: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";
          notes?: string | null;
          bill_id?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          service_name?: string;
          stylist_name?: string | null;
          appointment_date?: string;
          appointment_time?: string;
          status?: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";
          notes?: string | null;
          bill_id?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "appointments_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
        ];
      };
      jewellery_exchanges: {
        Row: {
          id: string;
          shop_id: string;
          bill_id: string | null;
          metal_type: "gold" | "silver";
          description: string | null;
          gross_weight: number;
          purity_percent: number;
          net_weight: number;
          rate_per_gram: number;
          exchange_value: number;
          customer_id: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          bill_id?: string | null;
          metal_type: "gold" | "silver";
          description?: string | null;
          gross_weight: number;
          purity_percent: number;
          net_weight: number;
          rate_per_gram: number;
          exchange_value: number;
          customer_id?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          bill_id?: string | null;
          metal_type?: "gold" | "silver";
          description?: string | null;
          gross_weight?: number;
          purity_percent?: number;
          net_weight?: number;
          rate_per_gram?: number;
          exchange_value?: number;
          customer_id?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "jewellery_exchanges_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
        ];
      };
      metal_rates: {
        Row: { id: string; shop_id: string; metal_type: "gold" | "silver"; rate_per_gram: number; effective_date: string; created_at: string };
        Insert: { id?: string; shop_id: string; metal_type: "gold" | "silver"; rate_per_gram: number; effective_date?: string; created_at?: string };
        Update: { id?: string; shop_id?: string; metal_type?: "gold" | "silver"; rate_per_gram?: number; effective_date?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "metal_rates_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      service_job_items: {
        Row: { id: string; job_id: string; item_name: string; quantity: number; notes: string | null; created_at: string };
        Insert: { id?: string; job_id: string; item_name: string; quantity?: number; notes?: string | null; created_at?: string };
        Update: { id?: string; job_id?: string; item_name?: string; quantity?: number; notes?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "service_job_items_job_id_fkey"; columns: ["job_id"]; isOneToOne: false; referencedRelation: "service_jobs"; referencedColumns: ["id"] },
        ];
      };
      service_jobs: {
        Row: {
          id: string;
          shop_id: string;
          job_number: string;
          financial_year: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          item_description: string;
          issue_description: string | null;
          status: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
          technician_name: string | null;
          estimated_cost: number | null;
          final_cost: number | null;
          advance_paid: number;
          expected_date: string | null;
          ready_at: string | null;
          delivered_at: string | null;
          bill_id: string | null;
          notes: string | null;
          staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          job_number: string;
          financial_year: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          item_description: string;
          issue_description?: string | null;
          status?: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
          technician_name?: string | null;
          estimated_cost?: number | null;
          final_cost?: number | null;
          advance_paid?: number;
          expected_date?: string | null;
          ready_at?: string | null;
          delivered_at?: string | null;
          bill_id?: string | null;
          notes?: string | null;
          staff_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          job_number?: string;
          financial_year?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          item_description?: string;
          issue_description?: string | null;
          status?: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
          technician_name?: string | null;
          estimated_cost?: number | null;
          final_cost?: number | null;
          advance_paid?: number;
          expected_date?: string | null;
          ready_at?: string | null;
          delivered_at?: string | null;
          bill_id?: string | null;
          notes?: string | null;
          staff_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "service_jobs_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "service_jobs_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
        ];
      };
      job_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      vehicles: {
        Row: { id: string; shop_id: string; name: string; vehicle_number: string | null; rate_per_km: number; is_active: boolean; rc_expiry: string | null; insurance_expiry: string | null; puc_expiry: string | null; fitness_expiry: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; vehicle_number?: string | null; rate_per_km?: number; is_active?: boolean; rc_expiry?: string | null; insurance_expiry?: string | null; puc_expiry?: string | null; fitness_expiry?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; vehicle_number?: string | null; rate_per_km?: number; is_active?: boolean; rc_expiry?: string | null; insurance_expiry?: string | null; puc_expiry?: string | null; fitness_expiry?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "vehicles_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      transport_trips: {
        Row: {
          id: string;
          shop_id: string;
          vehicle_id: string;
          customer_id: string | null;
          bill_id: string | null;
          staff_id: string;
          trip_date: string;
          km: number;
          rate_per_km: number;
          transport_charge: number;
          gst_percent: number;
          notes: string | null;
          driver_name: string | null;
          load_weight: number | null;
          load_unit: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          vehicle_id: string;
          customer_id?: string | null;
          bill_id?: string | null;
          staff_id: string;
          trip_date?: string;
          km: number;
          rate_per_km: number;
          transport_charge: number;
          gst_percent?: number;
          notes?: string | null;
          driver_name?: string | null;
          load_weight?: number | null;
          load_unit?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          vehicle_id?: string;
          customer_id?: string | null;
          bill_id?: string | null;
          staff_id?: string;
          trip_date?: string;
          km?: number;
          rate_per_km?: number;
          transport_charge?: number;
          gst_percent?: number;
          notes?: string | null;
          driver_name?: string | null;
          load_weight?: number | null;
          load_unit?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "transport_trips_vehicle_id_fkey"; columns: ["vehicle_id"]; isOneToOne: false; referencedRelation: "vehicles"; referencedColumns: ["id"] },
          { foreignKeyName: "transport_trips_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
        ];
      };
      combos: {
        Row: { id: string; shop_id: string; name: string; price: number; gst_percent: number; is_active: boolean; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; price: number; gst_percent?: number; is_active?: boolean; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; price?: number; gst_percent?: number; is_active?: boolean; created_at?: string };
        Relationships: [
          { foreignKeyName: "combos_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      combo_items: {
        Row: { id: string; combo_id: string; product_id: string | null; product_name: string; quantity: number };
        Insert: { id?: string; combo_id: string; product_id?: string | null; product_name: string; quantity?: number };
        Update: { id?: string; combo_id?: string; product_id?: string | null; product_name?: string; quantity?: number };
        Relationships: [
          { foreignKeyName: "combo_items_combo_id_fkey"; columns: ["combo_id"]; isOneToOne: false; referencedRelation: "combos"; referencedColumns: ["id"] },
        ];
      };
      batch_writeoffs: {
        Row: {
          id: string;
          shop_id: string;
          batch_id: string;
          product_id: string;
          product_name: string;
          batch_number: string;
          staff_id: string;
          quantity: number;
          reason: "expired" | "damaged" | "other";
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          batch_id: string;
          product_id: string;
          product_name: string;
          batch_number: string;
          staff_id: string;
          quantity: number;
          reason: "expired" | "damaged" | "other";
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          batch_id?: string;
          product_id?: string;
          product_name?: string;
          batch_number?: string;
          staff_id?: string;
          quantity?: number;
          reason?: "expired" | "damaged" | "other";
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "batch_writeoffs_batch_id_fkey"; columns: ["batch_id"]; isOneToOne: false; referencedRelation: "medicine_batches"; referencedColumns: ["id"] },
        ];
      };
      medicine_batches: {
        Row: {
          id: string;
          shop_id: string;
          product_id: string;
          batch_number: string;
          manufacturer: string | null;
          mfg_date: string | null;
          expiry_date: string;
          quantity: number;
          purchase_price: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          product_id: string;
          batch_number: string;
          manufacturer?: string | null;
          mfg_date?: string | null;
          expiry_date: string;
          quantity?: number;
          purchase_price?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          product_id?: string;
          batch_number?: string;
          manufacturer?: string | null;
          mfg_date?: string | null;
          expiry_date?: string;
          quantity?: number;
          purchase_price?: number | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "medicine_batches_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      restaurant_tables: {
        Row: { id: string; shop_id: string; name: string; status: "free" | "occupied"; section: "inside" | "outside" | "takeaway" | null; qr_token: string; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; status?: "free" | "occupied"; section?: "inside" | "outside" | "takeaway" | null; qr_token?: string; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; status?: "free" | "occupied"; section?: "inside" | "outside" | "takeaway" | null; qr_token?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "restaurant_tables_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      table_order_requests: {
        Row: {
          id: string;
          shop_id: string;
          table_id: string;
          status: "pending" | "accepted" | "rejected";
          customer_name: string | null;
          created_at: string;
          handled_at: string | null;
        };
        Insert: {
          id?: string;
          shop_id: string;
          table_id: string;
          status?: "pending" | "accepted" | "rejected";
          customer_name?: string | null;
          created_at?: string;
          handled_at?: string | null;
        };
        Update: {
          id?: string;
          shop_id?: string;
          table_id?: string;
          status?: "pending" | "accepted" | "rejected";
          customer_name?: string | null;
          created_at?: string;
          handled_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "table_order_requests_table_id_fkey"; columns: ["table_id"]; isOneToOne: false; referencedRelation: "restaurant_tables"; referencedColumns: ["id"] },
        ];
      };
      table_order_request_items: {
        Row: { id: string; request_id: string; product_id: string; product_name: string; quantity: number; unit_price: number };
        Insert: { id?: string; request_id: string; product_id: string; product_name: string; quantity: number; unit_price: number };
        Update: { id?: string; request_id?: string; product_id?: string; product_name?: string; quantity?: number; unit_price?: number };
        Relationships: [
          { foreignKeyName: "table_order_request_items_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "table_order_requests"; referencedColumns: ["id"] },
        ];
      };
      restaurant_order_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      restaurant_orders: {
        Row: {
          id: string;
          shop_id: string;
          table_id: string;
          staff_id: string;
          customer_id: string | null;
          order_number: string;
          financial_year: string;
          status: "open" | "settled" | "cancelled";
          order_type: "dine_in" | "takeaway" | "delivery";
          waiter_name: string | null;
          supply_type: "intra" | "inter";
          subtotal: number;
          discount_type: "flat" | "percent";
          discount_value: number;
          discount_amount: number;
          taxable_amount: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          round_off_amount: number;
          total: number;
          paid_amount: number;
          credit_amount: number;
          settled_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          revised_at: string | null;
          sent_to_kitchen_at: string | null;
          first_ready_at: string | null;
          served_at: string | null;
          reservation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          table_id: string;
          staff_id: string;
          customer_id?: string | null;
          order_number: string;
          financial_year: string;
          status?: "open" | "settled" | "cancelled";
          order_type?: "dine_in" | "takeaway" | "delivery";
          waiter_name?: string | null;
          supply_type?: "intra" | "inter";
          subtotal?: number;
          discount_type?: "flat" | "percent";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          round_off_amount?: number;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          settled_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          revised_at?: string | null;
          sent_to_kitchen_at?: string | null;
          first_ready_at?: string | null;
          served_at?: string | null;
          reservation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          table_id?: string;
          staff_id?: string;
          customer_id?: string | null;
          order_number?: string;
          financial_year?: string;
          status?: "open" | "settled" | "cancelled";
          order_type?: "dine_in" | "takeaway" | "delivery";
          waiter_name?: string | null;
          supply_type?: "intra" | "inter";
          subtotal?: number;
          discount_type?: "flat" | "percent";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          round_off_amount?: number;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          settled_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          revised_at?: string | null;
          sent_to_kitchen_at?: string | null;
          first_ready_at?: string | null;
          served_at?: string | null;
          reservation_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "restaurant_orders_table_id_fkey"; columns: ["table_id"]; isOneToOne: false; referencedRelation: "restaurant_tables"; referencedColumns: ["id"] },
          { foreignKeyName: "restaurant_orders_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      restaurant_order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_total: number;
          kot_printed: boolean;
          status: "pending" | "ready" | "served" | "cancelled";
          ready_at: string | null;
          served_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total: number;
          kot_printed?: boolean;
          status?: "pending" | "ready" | "served" | "cancelled";
          ready_at?: string | null;
          served_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total?: number;
          kot_printed?: boolean;
          status?: "pending" | "ready" | "served" | "cancelled";
          ready_at?: string | null;
          served_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "restaurant_order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "restaurant_orders"; referencedColumns: ["id"] },
          { foreignKeyName: "restaurant_order_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      returns: {
        Row: {
          id: string;
          shop_id: string;
          bill_id: string;
          customer_id: string | null;
          staff_id: string;
          return_number: string;
          financial_year: string;
          reason: string | null;
          subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          total: number;
          refund_method: "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment";
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          bill_id: string;
          customer_id?: string | null;
          staff_id: string;
          return_number: string;
          financial_year: string;
          reason?: string | null;
          subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          total?: number;
          refund_method?: "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment";
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          bill_id?: string;
          customer_id?: string | null;
          staff_id?: string;
          return_number?: string;
          financial_year?: string;
          reason?: string | null;
          subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          total?: number;
          refund_method?: "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment";
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "returns_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "returns_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      return_items: {
        Row: {
          id: string;
          return_id: string;
          bill_item_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          return_id: string;
          bill_item_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total: number;
        };
        Update: {
          id?: string;
          return_id?: string;
          bill_item_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total?: number;
        };
        Relationships: [
          { foreignKeyName: "return_items_return_id_fkey"; columns: ["return_id"]; isOneToOne: false; referencedRelation: "returns"; referencedColumns: ["id"] },
          { foreignKeyName: "return_items_bill_item_id_fkey"; columns: ["bill_item_id"]; isOneToOne: false; referencedRelation: "bill_items"; referencedColumns: ["id"] },
        ];
      };
      stock_audits: {
        Row: {
          id: string;
          shop_id: string;
          staff_id: string;
          status: "draft" | "completed";
          notes: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          shop_id: string;
          staff_id: string;
          status?: "draft" | "completed";
          notes?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          shop_id?: string;
          staff_id?: string;
          status?: "draft" | "completed";
          notes?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "stock_audits_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      stock_audit_items: {
        Row: {
          id: string;
          audit_id: string;
          product_id: string;
          product_name: string;
          unit: string;
          system_quantity: number;
          counted_quantity: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          product_id: string;
          product_name: string;
          unit?: string;
          system_quantity: number;
          counted_quantity?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          audit_id?: string;
          product_id?: string;
          product_name?: string;
          unit?: string;
          system_quantity?: number;
          counted_quantity?: number | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "stock_audit_items_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "stock_audits"; referencedColumns: ["id"] },
          { foreignKeyName: "stock_audit_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      return_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      restaurant_order_payments: {
        Row: { id: string; order_id: string; payment_method: "cash" | "card" | "upi" | "online" | "other"; amount: number; created_at: string };
        Insert: { id?: string; order_id: string; payment_method: "cash" | "card" | "upi" | "online" | "other"; amount: number; created_at?: string };
        Update: { id?: string; order_id?: string; payment_method?: "cash" | "card" | "upi" | "online" | "other"; amount?: number; created_at?: string };
        Relationships: [
          { foreignKeyName: "restaurant_order_payments_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "restaurant_orders"; referencedColumns: ["id"] },
        ];
      };
      rentals: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          staff_id: string;
          rental_number: string;
          financial_year: string;
          status: "booked" | "active" | "returned" | "cancelled";
          start_date: string;
          end_date: string;
          actual_return_date: string | null;
          supply_type: "intra" | "inter";
          subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          delivery_required: boolean;
          delivery_address: string | null;
          delivery_charge: number;
          security_deposit_collected: number;
          security_deposit_returned: number;
          damage_charge: number;
          late_fee: number;
          total: number;
          payment_method: "cash" | "card" | "upi" | "online" | "other";
          paid_amount: number;
          credit_amount: number;
          edited_at: string | null;
          edited_by: string | null;
          edit_reason: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          staff_id: string;
          rental_number: string;
          financial_year: string;
          status?: "booked" | "active" | "returned" | "cancelled";
          start_date: string;
          end_date: string;
          actual_return_date?: string | null;
          supply_type?: "intra" | "inter";
          subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          delivery_required?: boolean;
          delivery_address?: string | null;
          delivery_charge?: number;
          security_deposit_collected?: number;
          security_deposit_returned?: number;
          damage_charge?: number;
          late_fee?: number;
          total?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          paid_amount?: number;
          credit_amount?: number;
          edited_at?: string | null;
          edited_by?: string | null;
          edit_reason?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          staff_id?: string;
          rental_number?: string;
          financial_year?: string;
          status?: "booked" | "active" | "returned" | "cancelled";
          start_date?: string;
          end_date?: string;
          actual_return_date?: string | null;
          supply_type?: "intra" | "inter";
          subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          delivery_required?: boolean;
          delivery_address?: string | null;
          delivery_charge?: number;
          security_deposit_collected?: number;
          security_deposit_returned?: number;
          damage_charge?: number;
          late_fee?: number;
          total?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          paid_amount?: number;
          credit_amount?: number;
          edited_at?: string | null;
          edited_by?: string | null;
          edit_reason?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "rentals_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "rentals_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      rental_items: {
        Row: {
          id: string;
          rental_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          rate_type: "hourly" | "daily" | "weekly" | "monthly";
          rate: number;
          duration: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_total: number;
          deposit_per_unit: number;
          condition_on_return: "good" | "damaged" | "missing" | null;
          damage_notes: string | null;
        };
        Insert: {
          id?: string;
          rental_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          rate_type: "hourly" | "daily" | "weekly" | "monthly";
          rate: number;
          duration: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total: number;
          deposit_per_unit?: number;
          condition_on_return?: "good" | "damaged" | "missing" | null;
          damage_notes?: string | null;
        };
        Update: {
          id?: string;
          rental_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          rate_type?: "hourly" | "daily" | "weekly" | "monthly";
          rate?: number;
          duration?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_total?: number;
          deposit_per_unit?: number;
          condition_on_return?: "good" | "damaged" | "missing" | null;
          damage_notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "rental_items_rental_id_fkey"; columns: ["rental_id"]; isOneToOne: false; referencedRelation: "rentals"; referencedColumns: ["id"] },
          { foreignKeyName: "rental_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      rental_counters: {
        Row: { shop_id: string; financial_year: string; last_number: number };
        Insert: { shop_id: string; financial_year: string; last_number?: number };
        Update: { shop_id?: string; financial_year?: string; last_number?: number };
        Relationships: [];
      };
      super_admins: {
        Row: { user_id: string; name: string; created_at: string };
        Insert: { user_id: string; name: string; created_at?: string };
        Update: { user_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      subscription_transactions: {
        Row: {
          id: string;
          shop_id: string;
          amount: number;
          new_valid_until: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          amount?: number;
          new_valid_until?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          amount?: number;
          new_valid_until?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "subscription_transactions_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      festival_notes: {
        Row: {
          shop_id: string;
          festival_slug: string;
          note: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          shop_id: string;
          festival_slug: string;
          note?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          shop_id?: string;
          festival_slug?: string;
          note?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "festival_notes_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      item_requests: {
        Row: {
          id: string;
          shop_id: string;
          staff_id: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          item_description: string;
          advance_amount: number;
          expected_date: string | null;
          status: "pending" | "available" | "fulfilled" | "cancelled";
          notes: string | null;
          notified_at: string | null;
          fulfilled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          staff_id: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          item_description: string;
          advance_amount?: number;
          expected_date?: string | null;
          status?: "pending" | "available" | "fulfilled" | "cancelled";
          notes?: string | null;
          notified_at?: string | null;
          fulfilled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          staff_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          item_description?: string;
          advance_amount?: number;
          expected_date?: string | null;
          status?: "pending" | "available" | "fulfilled" | "cancelled";
          notes?: string | null;
          notified_at?: string | null;
          fulfilled_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "item_requests_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "item_requests_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      purchase_payments: {
        Row: { id: string; shop_id: string; vendor_id: string; staff_id: string; amount: number; payment_method: "cash" | "card" | "upi" | "online" | "other"; note: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; vendor_id: string; staff_id: string; amount: number; payment_method?: "cash" | "card" | "upi" | "online" | "other"; note?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; vendor_id?: string; staff_id?: string; amount?: number; payment_method?: "cash" | "card" | "upi" | "online" | "other"; note?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "purchase_payments_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_payments_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: false; referencedRelation: "vendors"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_invoice_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_rental_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_restaurant_order_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_return_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_job_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_prescription_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      next_lab_order_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
      decrement_stock: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: undefined;
      };
      increment_stock: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
