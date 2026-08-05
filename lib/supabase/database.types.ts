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
          created_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "staff";
          created_at: string;
        };
        Insert: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "staff";
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          role?: "owner" | "staff";
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
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "customers_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
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
          payment_method: "cash" | "card" | "upi" | "online" | "other";
          status: "active" | "voided";
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          doctor_name: string | null;
          patient_name: string | null;
          total: number;
          paid_amount: number;
          credit_amount: number;
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
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          status?: "active" | "voided";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          doctor_name?: string | null;
          patient_name?: string | null;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
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
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          status?: "active" | "voided";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          doctor_name?: string | null;
          patient_name?: string | null;
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
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
        Row: { id: string; shop_id: string; name: string; status: "free" | "occupied"; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; status?: "free" | "occupied"; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; status?: "free" | "occupied"; created_at?: string };
        Relationships: [
          { foreignKeyName: "restaurant_tables_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
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
          total: number;
          paid_amount: number;
          credit_amount: number;
          settled_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
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
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          settled_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
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
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          settled_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
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
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "restaurant_order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "restaurant_orders"; referencedColumns: ["id"] },
          { foreignKeyName: "restaurant_order_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
