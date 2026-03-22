# Contexto de Diseño para Emails de Supabase - RunOp

Este documento contiene los estilos, colores y estructura HTML necesarios para configurar las plantillas de correo en Supabase (Authentication -> Email Templates) manteniendo la identidad visual de la aplicación **RunOp**.

## 1. Identidad Visual (Brand Assets)

### Colores (Extraídos de Tailwind Config)
*   **Primario (Naranja Marca):** `#E94E1B` (Acciones principales, botones)
*   **Secundario (Navy/Azul Oscuro):** `#091056` (Encabezados, pie de página)
*   **Fondo General:** `#F3F4F6` (Gris muy suave)
*   **Fondo Tarjeta:** `#FFFFFF` (Blanco)
*   **Texto Principal:** `#1F2937` (Gris oscuro)
*   **Texto Secundario:** `#6B7280` (Gris medio)

### Tipografía
*   Familia: `font-family: 'Inter', Helvetica, Arial, sans-serif;`

### Logo
Para que el logo se vea en el correo, **debes subir la imagen a un bucket público en Supabase**:
1. Ve a Supabase > Storage.
2. Crea un bucket público llamado `public-assets` (si no existe).
3. Sube el archivo `LogoRunOP.jpeg`.
4. Obtén la URL pública.
5. **Reemplaza en los templates:** `SRC_DEL_LOGO` por esa URL.

---

## 2. Plantilla Base HTML (Boilerplate)

Usa esta estructura para todos los correos. Solo cambia el contenido dentro del bloque `<!-- CONTENIDO -->`.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RunOp Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: 'Inter', Helvetica, Arial, sans-serif;">
  
  <!-- Contenedor Principal -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F3F4F6; padding: 40px 0;">
    <tr>
      <td align="center">
        
        <!-- Tarjeta Blanca -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <!-- Encabezado (Logo) -->
          <tr>
            <td align="center" style="padding: 30px 40px; background-color: #ffffff; border-bottom: 1px solid #E5E7EB;">
              <img src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4" alt="RunOp Logo" width="120" style="display: block; max-width: 150px; height: auto;">
            </td>
          </tr>

          <!-- Cuerpo del Mensaje -->
          <tr>
            <td style="padding: 40px 40px;">
              <!-- INICIO CONTENIDO DINÁMICO -->
              
              <h1 style="margin: 0 0 20px 0; color: #091056; font-size: 24px; font-weight: 700; text-align: center;">
                {{ .Header }}
              </h1>
              
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 24px; text-align: center;">
                {{ .Body }}
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="{{ .ConfirmationURL }}" style="background-color: #E94E1B; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                  {{ .ButtonText }}
                </a>
              </div>
              
              <p style="margin: 24px 0 0 0; color: #6B7280; font-size: 14px; line-height: 20px; text-align: center;">
                Si no solicitaste esto, puedes ignorar este correo.
              </p>
              
              <!-- FIN CONTENIDO DINÁMICO -->
            </td>
          </tr>

          <!-- Pie de Página -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 20px 40px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                © 2026 RunOp. Gestión Operativa Inteligente.<br>
                Enviado automáticamente por el sistema.
              </p>
            </td>
          </tr>
          
        </table>
        <!-- Fin Tarjeta -->

      </td>
    </tr>
  </table>

</body>
</html>
```

---

## 3. Contenidos Específicos para Copiar y Pegar

### A. Confirm Sign Up (Confirmar Registro)
*Subject:* Confirma tu cuenta en RunOp

**Variables para el HTML:**
*   **Header:** ¡Bienvenido a RunOp!
*   **Body:** Gracias por registrarte. Para comenzar a gestionar tus operaciones, por favor confirma tu dirección de correo electrónico haciendo clic en el botón de abajo.
*   **ButtonText:** Confirmar mi cuenta
*   **Link:** `{{ .ConfirmationURL }}`

### B. Invite User (Invitación a Usuario)
*Subject:* Has sido invitado a unirte a RunOp

**Variables para el HTML:**
*   **Header:** Invitación de Acceso
*   **Body:** Te han creado una cuenta para acceder a la plataforma de gestión operativa **RunOp**. Haz clic a continuación para aceptar la invitación y configurar tu contraseña.
*   **ButtonText:** Aceptar Invitación
*   **Link:** `{{ .ConfirmationURL }}`

### C. Reset Password (Recuperar Contraseña)
*Subject:* Restablecer contraseña - RunOp

**Variables para el HTML:**
*   **Header:** Recuperación de Contraseña
*   **Body:** Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, haz clic en el botón de abajo para crear una nueva contraseña. El enlace expira en 1 hora.
*   **ButtonText:** Restablecer Contraseña
*   **Link:** `{{ .ConfirmationURL }}`

### D. Magic Link (Login sin contraseña)
*Subject:* Tu enlace de acceso a RunOp

**Variables para el HTML:**
*   **Header:** Acceso Directo
*   **Body:** Haz clic en el botón para iniciar sesión en RunOp automáticamente.
*   **ButtonText:** Iniciar Sesión
*   **Link:** `{{ .ConfirmationURL }}`