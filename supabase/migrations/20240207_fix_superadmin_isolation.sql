-- Actualizar función de envío de mensajes para permitir Override de Tenant (Para Superadmin)
CREATE OR REPLACE FUNCTION public.send_broadcast_message(
  p_asunto text, 
  p_cuerpo text, 
  p_tipo text, 
  p_prioridad text, 
  p_requiere_confirmacion boolean, 
  p_recipient_type text, 
  p_recipient_id text DEFAULT NULL::text, 
  p_rutina_id uuid DEFAULT NULL::uuid, 
  p_fecha_programada date DEFAULT NULL::date, 
  p_hora_programada time without time zone DEFAULT NULL::time without time zone,
  p_override_tenant_id uuid DEFAULT NULL::uuid -- NUEVO PARÁMETRO
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id UUID;
  v_message_id UUID;
  v_sender_id UUID := auth.uid();
  v_target_users UUID[];
  v_pdv_ids UUID[];
  v_user_id UUID;
  v_pdv_id UUID;
  v_default_pdv_id UUID;
  v_fecha_tarea DATE;
  v_hora_inicio TIME;
  v_hora_limite TIME;
  v_prioridad_tarea VARCHAR;
BEGIN
  -- 1. Determinar Tenant ID
  -- Si viene un override (Superadmin) lo usamos, si no, usamos el del perfil del sender
  IF p_override_tenant_id IS NOT NULL THEN
    v_tenant_id := p_override_tenant_id;
  ELSE
    SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = v_sender_id;
  END IF;

  -- CONFIGURACIÓN DE FECHA Y HORA
  v_fecha_tarea := COALESCE(p_fecha_programada, (now() AT TIME ZONE 'America/Bogota')::date);
  v_hora_inicio := COALESCE(p_hora_programada, (now() AT TIME ZONE 'America/Bogota')::time);
  
  IF p_rutina_id IS NOT NULL THEN
    v_hora_limite := '23:59:59'::TIME;
    v_prioridad_tarea := 'critica';
  ELSE
    v_hora_limite := LEAST(v_hora_inicio + INTERVAL '4 hours', '23:59:59'::TIME);
    v_prioridad_tarea := p_prioridad;
  END IF;

  -- 2. Insertar Mensaje
  INSERT INTO public.messages (
    tenant_id, created_by, tipo, asunto, cuerpo, prioridad, requiere_confirmacion, rutina_id
  ) VALUES (
    v_tenant_id, v_sender_id, p_tipo, p_asunto, p_cuerpo, p_prioridad, p_requiere_confirmacion, p_rutina_id
  ) RETURNING id INTO v_message_id;

  INSERT INTO public.message_recipients (message_id, recipient_type, recipient_id)
  VALUES (v_message_id, p_recipient_type, p_recipient_id);

  -- 3. Resolver Destinatarios (FILTRADOS POR TENANT_ID)
  IF p_recipient_type = 'user' THEN
    v_target_users := ARRAY[p_recipient_id::UUID];
  ELSIF p_recipient_type = 'role' THEN
    SELECT ARRAY_AGG(id) INTO v_target_users FROM public.profiles 
    WHERE tenant_id = v_tenant_id AND role = p_recipient_id AND activo = true;
  ELSIF p_recipient_type = 'pdv' THEN
    BEGIN
        SELECT ARRAY(SELECT jsonb_array_elements_text(p_recipient_id::jsonb)::uuid) INTO v_pdv_ids;
    EXCEPTION WHEN OTHERS THEN
        v_pdv_ids := ARRAY[p_recipient_id::UUID];
    END;
    SELECT ARRAY_AGG(user_id) INTO v_target_users FROM public.pdv_assignments 
    WHERE tenant_id = v_tenant_id AND pdv_id = ANY(v_pdv_ids) AND vigente = true;
  ELSIF p_recipient_type = 'all' THEN
    SELECT ARRAY_AGG(id) INTO v_target_users FROM public.profiles 
    WHERE tenant_id = v_tenant_id AND activo = true;
  END IF;

  -- 4. Crear Notificaciones
  IF v_target_users IS NOT NULL THEN
    INSERT INTO public.message_receipts (message_id, user_id)
    SELECT v_message_id, u_id FROM UNNEST(v_target_users) AS u_id;

    INSERT INTO public.notifications (tenant_id, user_id, type, title, entity_id)
    SELECT v_tenant_id, u_id, 'message', 'Nuevo mensaje: ' || SUBSTRING(p_asunto FROM 1 FOR 30), v_message_id
    FROM UNNEST(v_target_users) AS u_id WHERE u_id != v_sender_id;
  END IF;

  -- 5. CREACIÓN DE TAREAS FLASH
  IF p_rutina_id IS NOT NULL AND v_target_users IS NOT NULL THEN
    
    SELECT id INTO v_default_pdv_id FROM public.pdv WHERE tenant_id = v_tenant_id LIMIT 1;
    
    FOREACH v_user_id IN ARRAY v_target_users LOOP
      v_pdv_id := NULL;

      SELECT pdv_id INTO v_pdv_id FROM public.pdv_assignments 
      WHERE user_id = v_user_id AND vigente = true AND tenant_id = v_tenant_id LIMIT 1;
      
      IF v_pdv_id IS NULL THEN 
        v_pdv_id := v_default_pdv_id; 
      END IF;

      IF v_pdv_id IS NOT NULL THEN
        INSERT INTO public.task_instances (
          tenant_id, rutina_id, pdv_id, responsable_id, fecha_programada,
          estado, prioridad_snapshot, hora_inicio_snapshot, hora_limite_snapshot, created_at
        ) VALUES (
          v_tenant_id, p_rutina_id, v_pdv_id, v_user_id, v_fecha_tarea,
          'pendiente', v_prioridad_tarea, v_hora_inicio, v_hora_limite, NOW()
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_message_id;
END;
$function$;