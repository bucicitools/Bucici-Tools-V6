import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            name?: string;
            email?: string;
            password?: string;
            licenseCode?: string;
            businessName?: string;
          };

          const name = body.name?.trim() ?? "";
          const email = body.email?.trim() ?? "";
          const password = body.password ?? "";
          const businessName = body.businessName?.trim() ?? "";
          const rawLicenseCode = body.licenseCode?.trim() ?? "";

          if (!name || !email || !password) {
            return Response.json(
              { error: "Nama lengkap, email, dan kata sandi wajib diisi." },
              { status: 400 },
            );
          }

          if (password.length < 8) {
            return Response.json({ error: "Kata sandi minimal 8 karakter." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Check if there's any super admin user in system
          const { data: hasSA } = await supabaseAdmin.rpc("has_any_super_admin");
          const isFirstUser = !hasSA;

          let formattedLicense = "";
          if (!isFirstUser) {
            if (!businessName) {
              return Response.json({ error: "Nama toko / tenant wajib diisi." }, { status: 400 });
            }

            formattedLicense = rawLicenseCode.toUpperCase();
            if (!/^BUCICI-[A-Za-z0-9]{4,}$/.test(formattedLicense)) {
              return Response.json(
                { error: "Format kode lisensi tidak valid. Contoh: BUCICI-XXXX" },
                { status: 400 },
              );
            }

            // Check if license is available
            const { data: isAvailable } = await supabaseAdmin.rpc("license_available", {
              _code: formattedLicense,
            });

            if (!isAvailable) {
              return Response.json(
                { error: "Kode lisensi tidak ditemukan atau sudah pernah digunakan." },
                { status: 400 },
              );
            }
          }

          // Create auth user with pre-confirmed email (no verification email needed)
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, businessName, licenseCode: formattedLicense },
          });

          if (createErr || !created?.user) {
            const msg = createErr?.message ?? "Gagal mendaftarkan akun.";
            const userFriendlyMsg = msg.toLowerCase().includes("already registered")
              ? "Email ini sudah terdaftar. Silakan gunakan menu Masuk."
              : msg;
            return Response.json({ error: userFriendlyMsg }, { status: 400 });
          }

          const userId = created.user.id;

          if (isFirstUser) {
            // Super admin registration
            await supabaseAdmin.from("profiles").upsert({
              id: userId,
              name,
              email,
            });

            await supabaseAdmin
              .from("user_roles")
              .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });
          } else {
            // Owner tenant creation
            const { data: tenant, error: tenantErr } = await supabaseAdmin
              .from("tenants")
              .insert({
                business_name: businessName,
                owner_id: userId,
                owner_name: name,
                license_code: formattedLicense,
                active: true,
              })
              .select("id")
              .single();

            if (tenantErr || !tenant) {
              return Response.json(
                { error: `Gagal membuat toko: ${tenantErr?.message || "Unknown error"}` },
                { status: 500 },
              );
            }

            const tenantId = tenant.id;

            // Mark license as used
            await supabaseAdmin
              .from("licenses")
              .update({ used: true, used_by: tenantId })
              .eq("code", formattedLicense);

            // Upsert profile with tenant_id & role
            await supabaseAdmin.from("profiles").upsert({
              id: userId,
              name,
              email,
              tenant_id: tenantId,
            });

            // Assign owner role
            await supabaseAdmin
              .from("user_roles")
              .upsert({ user_id: userId, role: "owner" }, { onConflict: "user_id,role" });
          }

          return Response.json({
            ok: true,
            userId,
            isFirstUser,
          });
        } catch (err) {
          console.error("[register owner error]", err);
          return Response.json(
            { error: (err as Error).message ?? "Kesalahan server saat pendaftaran." },
            { status: 500 },
          );
        }
      },
    },
  },
});
