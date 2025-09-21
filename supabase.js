// supabase.js - Configuración de conexión con Supabase
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Funciones para manejar la autenticación
export const auth = {
  // Iniciar sesión
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Cerrar sesión
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Obtener usuario actual
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
  },

  // Escuchar cambios de autenticación
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Funciones para manejar productos
export const productos = {
  // Obtener catálogo completo
  async getCatalogo() {
    const { data, error } = await supabase
      .from('vista_productos_completa')
      .select('*')
      .order('categoria', { ascending: true })
    return { data, error }
  },

  // Obtener productos por categoría
  async getByCategoria(categoria) {
    const { data, error } = await supabase
      .from('vista_productos_completa')
      .select('*')
      .eq('categoria', categoria)
      .order('variante', { ascending: true })
    return { data, error }
  },

  // Buscar productos
  async buscar(termino) {
    const { data, error } = await supabase
      .from('vista_productos_completa')
      .select('*')
      .or(`producto.ilike.%${termino}%,categoria.ilike.%${termino}%,descripcion.ilike.%${termino}%`)
    return { data, error }
  }
}

// Funciones para manejar clientes
export const clientes = {
  // Crear nuevo cliente
  async crear(cliente) {
    const { data, error } = await supabase
      .from('clientes')
      .insert([cliente])
      .select()
    return { data, error }
  },

  // Buscar cliente por teléfono
  async buscarPorTelefono(telefono) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono', telefono)
      .single()
    return { data, error }
  },

  // Obtener todos los clientes
  async getAll() {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true })
    return { data, error }
  }
}

// Funciones para manejar ventas
export const ventas = {
  // Crear nueva venta
  async crear(venta) {
    const { data, error } = await supabase
      .from('ventas')
      .insert([venta])
      .select()
    return { data, error }
  },

  // Agregar item a venta
  async agregarItem(item) {
    const { data, error } = await supabase
      .from('items_venta')
      .insert([item])
      .select()
    return { data, error }
  },

  // Aplicar promoción
  async aplicarPromocion(ventaId, promocionId) {
    const { data, error } = await supabase
      .rpc('aplicar_promocion', {
        venta_id_param: ventaId,
        promocion_id_param: promocionId
      })
    return { data, error }
  },

  // Obtener venta completa con items
  async getCompleta(ventaId) {
    const venta = await supabase
      .from('ventas')
      .select(`
        *,
        cliente:clientes(*),
        items:items_venta(
          *,
          variante:variantes_producto(
            *,
            producto:productos(
              *,
              categoria:categorias(*)
            )
          )
        )
      `)
      .eq('id', ventaId)
      .single()
    return venta
  },

  // Obtener ventas del día
  async getDelDia(fecha = new Date().toISOString().split('T')[0]) {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        *,
        cliente:clientes(nombre, telefono)
      `)
      .gte('fecha', fecha)
      .lt('fecha', fecha + 'T23:59:59')
      .order('fecha', { ascending: false })
    return { data, error }
  },

  // Obtener reporte del día
  async getReporteDelDia(fecha = new Date().toISOString().split('T')[0]) {
    const { data, error } = await supabase
      .rpc('reporte_dia', { fecha_param: fecha })
    return { data, error }
  }
}

// Funciones para manejar promociones
export const promociones = {
  // Obtener promociones activas
  async getActivas() {
    const { data, error } = await supabase
      .from('promociones')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })
    return { data, error }
  }
}

// Funciones para editar productos
export const editarProducto = {
  // Actualizar variante de producto
  async actualizarVariante(varianteId, datos) {
    const { data, error } = await supabase
      .from('variantes_producto')
      .update({
        precio_costo: datos.precio_costo,
        precio_venta: datos.precio_venta,
        updated_at: new Date().toISOString()
      })
      .eq('id', varianteId)
      .select()
    return { data, error }
  }
}

// Funciones para agregar productos
export const agregarProducto = {
  // Crear nueva categoría
  async crearCategoria(categoria) {
    const { data, error } = await supabase
      .from('categorias')
      .insert([categoria])
      .select()
    return { data, error }
  },

  // Crear nuevo producto
  async crearProducto(producto) {
    const { data, error } = await supabase
      .from('productos')
      .insert([producto])
      .select()
    return { data, error }
  },

  // Crear variantes de producto
  async crearVariantes(variantes) {
    const { data, error } = await supabase
      .from('variantes_producto')
      .insert(variantes)
      .select()
    return { data, error }
  },

  // Obtener todas las categorías
  async obtenerCategorias() {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })
    return { data, error }
  }
}

// Funciones para gestionar promociones
export const gestionarPromociones = {
  // Crear nueva promoción
  async crear(promocion) {
    const { data, error } = await supabase
      .from('promociones')
      .insert([promocion])
      .select()
    return { data, error }
  },

  // Actualizar promoción existente
  async actualizar(id, cambios) {
    const { data, error } = await supabase
      .from('promociones')
      .update(cambios)
      .eq('id', id)
      .select()
    return { data, error }
  },

  // Activar/desactivar promoción
  async toggleActivo(id, activo) {
    const { data, error } = await supabase
      .from('promociones')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    return { data, error }
  },

  // Obtener todas las promociones
  async obtenerTodas() {
    const { data, error } = await supabase
      .from('promociones')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  }
}