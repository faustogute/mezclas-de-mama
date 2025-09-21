// App.jsx - Aplicación completa de Mezclas de Mamá
import React, { useState, useEffect } from 'react';
import { auth, productos, clientes, ventas, promociones, editarProducto, agregarProducto, gestionarPromociones } from './supabase.js';

// Componente principal
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pantalla, setPantalla] = useState('dashboard');
  const [catalogo, setCatalogo] = useState([]);
  const [promocionesActivas, setPromocionesActivas] = useState([]);
  const [ventaActual, setVentaActual] = useState({
    cliente: { nombre: '', telefono: '' },
    items: [],
    promocion: null,
    subtotal: 0,
    descuento: 0,
    total: 0
  });
  const [reporteDelDia, setReporteDelDia] = useState(null);

  // Verificar autenticación al cargar
  useEffect(() => {
    auth.getCurrentUser().then(user => {
      setUsuario(user);
      setLoading(false);
    });

    // Escuchar cambios de autenticación
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      setUsuario(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cargar datos iniciales cuando el usuario está autenticado
  useEffect(() => {
    if (usuario) {
      cargarDatosIniciales();
    }
  }, [usuario]);

  const cargarDatosIniciales = async () => {
    try {
      // Cargar catálogo
      const { data: catalogoData } = await productos.getCatalogo();
      setCatalogo(catalogoData || []);

      // Cargar promociones activas
      const { data: promocionesData } = await promociones.getActivas();
      setPromocionesActivas(promocionesData || []);

      // Cargar reporte del día
      const { data: reporteData } = await ventas.getReporteDelDia();
      setReporteDelDia(reporteData?.[0] || { total_ventas: 0, total_ingresos: 0, total_ganancias: 0 });
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  };

  const manejarLogin = async (email, password) => {
    try {
      const { error } = await auth.signIn(email, password);
      if (error) throw error;
    } catch (error) {
      alert('Error al iniciar sesión: ' + error.message);
    }
  };

  const manejarLogout = async () => {
    await auth.signOut();
    setPantalla('dashboard');
    setVentaActual({
      cliente: { nombre: '', telefono: '' },
      items: [],
      promocion: null,
      subtotal: 0,
      descuento: 0,
      total: 0
    });
  };

  const agregarProductoAVenta = (variante) => {
    const itemExistente = ventaActual.items.find(item => item.variante_id === variante.variante_id);
    
    let nuevosItems;
    if (itemExistente) {
      nuevosItems = ventaActual.items.map(item =>
        item.variante_id === variante.variante_id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      );
    } else {
      nuevosItems = [...ventaActual.items, {
        variante_id: variante.variante_id,
        producto: variante.producto,
        variante: variante.variante,
        categoria: variante.categoria,
        precio_unitario: variante.precio_venta,
        costo_unitario: variante.precio_costo,
        cantidad: 1
      }];
    }

    calcularTotales(nuevosItems, ventaActual.promocion);
  };

  const removerProductoDeVenta = (varianteId) => {
    const nuevosItems = ventaActual.items.filter(item => item.variante_id !== varianteId);
    calcularTotales(nuevosItems, ventaActual.promocion);
  };

  const calcularTotales = (items, promocion) => {
    const subtotal = items.reduce((sum, item) => sum + (item.precio_unitario * item.cantidad), 0);
    let descuento = 0;

    // Aplicar promoción si existe
    if (promocion) {
      if (promocion.tipo === 'porcentaje') {
        descuento = subtotal * (promocion.valor / 100);
      } else if (promocion.tipo === 'cantidad_fija') {
        descuento = promocion.valor;
      } else if (promocion.tipo === 'producto_gratis') {
        const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);
        if (totalItems >= 5) {
          const precioMenor = Math.min(...items.map(item => item.precio_unitario));
          descuento = precioMenor;
        }
      }
    }

    descuento = Math.min(descuento, subtotal);
    const total = subtotal - descuento;

    setVentaActual(prev => ({
      ...prev,
      items,
      promocion,
      subtotal,
      descuento,
      total
    }));
  };

  const procesarVenta = async () => {
    try {
      if (!ventaActual.cliente.nombre || ventaActual.items.length === 0) {
        alert('Por favor completa los datos del cliente y agrega productos');
        return;
      }

      // Crear o buscar cliente
      let clienteId;
      if (ventaActual.cliente.telefono) {
        const { data: clienteExistente } = await clientes.buscarPorTelefono(ventaActual.cliente.telefono);
        if (clienteExistente) {
          clienteId = clienteExistente.id;
        }
      }

      if (!clienteId) {
        const { data: nuevoCliente } = await clientes.crear(ventaActual.cliente);
        clienteId = nuevoCliente[0].id;
      }

      // Crear venta
      const { data: nuevaVenta } = await ventas.crear({
        cliente_id: clienteId,
        subtotal: ventaActual.subtotal,
        descuento: ventaActual.descuento,
        total: ventaActual.total,
        promocion_id: ventaActual.promocion?.id || null
      });

      const ventaId = nuevaVenta[0].id;

      // Agregar items
      for (const item of ventaActual.items) {
        await ventas.agregarItem({
          venta_id: ventaId,
          variante_producto_id: item.variante_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          costo_unitario: item.costo_unitario
        });
      }

      alert(`¡Venta procesada exitosamente! Ticket: ${nuevaVenta[0].numero_ticket}`);
      
      // Limpiar venta y actualizar datos
      setVentaActual({
        cliente: { nombre: '', telefono: '' },
        items: [],
        promocion: null,
        subtotal: 0,
        descuento: 0,
        total: 0
      });
      
      cargarDatosIniciales();
      setPantalla('dashboard');
    } catch (error) {
      console.error('Error procesando venta:', error);
      alert('Error procesando la venta: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
        <div className="text-xl text-purple-600">Cargando...</div>
      </div>
    );
  }

  if (!usuario) {
    return <PantallaLogin onLogin={manejarLogin} />;
  }

  const renderPantalla = () => {
    switch (pantalla) {
      case 'ventas':
        return (
          <PantallaVentas
            ventaActual={ventaActual}
            setVentaActual={setVentaActual}
            catalogo={catalogo}
            promociones={promocionesActivas}
            onAgregarProducto={agregarProductoAVenta}
            onRemoverProducto={removerProductoDeVenta}
            onAplicarPromocion={(promo) => calcularTotales(ventaActual.items, promo)}
            onProcesarVenta={procesarVenta}
            onVolver={() => setPantalla('dashboard')}
          />
        );
      case 'catalogo':
        return (
          <PantallaCatalogo
            catalogo={catalogo}
            onVolver={() => setPantalla('dashboard')}
          />
        );
      case 'promociones':
        return (
          <GestionPromociones
            onVolver={() => setPantalla('dashboard')}
          />
        );
      default:
        return (
          <Dashboard
            reporteDelDia={reporteDelDia}
            onIrAVentas={() => setPantalla('ventas')}
            onIrACatalogo={() => setPantalla('catalogo')}
            onIrAPromociones={() => setPantalla('promociones')}

          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      <Header usuario={usuario} onLogout={manejarLogout} />
      <main className="max-w-container">
        {renderPantalla()}
      </main>
      {usuario && <BottomNav pantalla={pantalla} setPantalla={setPantalla} />}
    </div>
  );
}

// Componente de Login
const PantallaLogin = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <div className="login-logo">
            <img src="/logo.svg" alt="Mezclas de mamá" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
          </div>
          <h2 className="login-title">Bienvenida</h2>
          <p className="login-subtitle">Accede a tu sistema de ventas</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Tu contraseña"
              required
            />
          </div>
          <button type="submit" className="login-button">
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  );
};

// Componente Header
const Header = ({ usuario, onLogout }) => (
  <header className="header">
    <div className="header-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="logo-circle">
          <img src="/logo.svg" alt="Mezclas de mamá" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        </div>
        <div>
          <h1 className="text-purple" style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Mezclas de Mamá</h1>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Sistema de Ventas</p>
        </div>
      </div>
      <button onClick={onLogout} className="text-purple" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
        </svg>
      </button>
    </div>
  </header>
);

// Componente Dashboard
const Dashboard = ({ reporteDelDia, onIrAVentas, onIrACatalogo, onIrAPromociones }) => (
  <div>
    <div className="dashboard-greeting">
      <h2 className="greeting-title">¡Hola! 👋</h2>
      <p className="greeting-subtitle">¿Qué quieres hacer hoy?</p>
    </div>

    <div className="dashboard-grid">
      <button onClick={onIrAVentas} className="dashboard-card sales-card">
        <div className="card-icon-container sales-icon">
          <svg width="28" height="28" fill="none" stroke="#2ecc71" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
          </svg>
        </div>
        <h3 className="card-title text-green">Ventas</h3>
        <p className="card-subtitle">Registrar nueva venta</p>
      </button>

      <button onClick={onIrACatalogo} className="dashboard-card catalog-card">
        <div className="card-icon-container catalog-icon">
          <svg width="28" height="28" fill="none" stroke="#3498db" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        </div>
        <h3 className="card-title text-blue">Catálogo</h3>
        <p className="card-subtitle">Ver productos</p>
      </button>
    </div>

    {/* Botón de Promociones - ancho completo */}
    <div style={{marginTop: '16px'}}>
      <button 
        onClick={onIrAPromociones} 
        className="dashboard-card" 
        style={{
          width: '100%', 
          background: 'white',
          borderTop: '4px solid #e91e63'
        }}
      >
        <div 
          className="card-icon-container" 
          style={{background: 'rgba(233, 30, 99, 0.1)'}}
        >
          <svg width="28" height="28" fill="none" stroke="#e91e63" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"></path>
          </svg>
        </div>
        <h3 className="card-title" style={{color: '#e91e63'}}>Promociones</h3>
        <p className="card-subtitle">Gestionar ofertas</p>
      </button>
    </div>

    {reporteDelDia && (
      <div className="stats-card" style={{marginTop: '24px'}}>
        <h3 className="stats-title">
          <svg className="stats-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          Resumen del Día
        </h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value sales-value">{reporteDelDia.total_ventas}</div>
            <div className="stat-label">Ventas</div>
          </div>
          <div className="stat-item">
            <div className="stat-value revenue-value">${reporteDelDia.total_ingresos}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-item">
            <div className="stat-value profit-value">${reporteDelDia.total_ganancias}</div>
            <div className="stat-label">Ganancia</div>
          </div>
        </div>
      </div>
    )}
  </div>
);

// Componente Pantalla Ventas
const PantallaVentas = ({
  ventaActual,
  setVentaActual,
  catalogo,
  promociones,
  onAgregarProducto,
  onRemoverProducto,
  onAplicarPromocion,
  onProcesarVenta,
  onVolver
}) => {
  const [mostrandoProductos, setMostrandoProductos] = useState(false);

  return (
    <div className="sales-container">
      <div className="sales-header">
        <button onClick={onVolver} className="back-button">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>
        <h2 className="sales-title">Nueva Venta</h2>
      </div>

      {/* Datos del Cliente */}
      <div className="section-card">
        <h3 className="section-title">Datos del Cliente</h3>
        <div className="input-group">
          <input
            type="text"
            placeholder="Nombre del cliente"
            value={ventaActual.cliente.nombre}
            onChange={(e) => setVentaActual(prev => ({
              ...prev,
              cliente: { ...prev.cliente, nombre: e.target.value }
            }))}
            className="sales-input"
          />
          <input
            type="tel"
            placeholder="Número de teléfono"
            value={ventaActual.cliente.telefono}
            onChange={(e) => setVentaActual(prev => ({
              ...prev,
              cliente: { ...prev.cliente, telefono: e.target.value }
            }))}
            className="sales-input"
          />
        </div>
      </div>

      {/* Productos */}
      <div className="section-card">
        <h3 className="section-title">Productos</h3>
        <button
          onClick={() => setMostrandoProductos(!mostrandoProductos)}
          className="add-product-button"
        >
          + Agregar Producto
        </button>
        
        {mostrandoProductos && (
          <div className="product-list">
            {catalogo.map((item, index) => (
              <div
                key={index}
                onClick={() => {
                  onAgregarProducto(item);
                  setMostrandoProductos(false);
                }}
                className="product-list-item"
              >
                <div className="product-name">{item.producto} - {item.variante}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {item.categoria} • ${item.precio_venta} • Ganancia: ${item.ganancia_unitaria}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Items agregados */}
        {ventaActual.items.map((item, index) => (
          <div key={index} className="product-item">
            <div className="product-item-header">
              <span className="product-name">{item.producto} - {item.variante}</span>
              <button
                onClick={() => onRemoverProducto(item.variante_id)}
                className="remove-button"
              >
                ×
              </button>
            </div>
            <div className="product-details">
              <span>Cantidad: {item.cantidad}</span>
              <span>${(item.precio_unitario * item.cantidad).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Promociones */}
      <div className="section-card">
        <h3 className="section-title">Promociones</h3>
        <select
          onChange={(e) => {
            const promo = promociones.find(p => p.id === e.target.value) || null;
            onAplicarPromocion(promo);
          }}
          className="sales-select"
        >
          <option value="">Sin promoción</option>
          {promociones.map(promo => (
            <option key={promo.id} value={promo.id}>{promo.nombre}</option>
          ))}
        </select>
      </div>

      {/* Resumen */}
      <div className="section-card">
        <h3 className="section-title">Resumen</h3>
        <div className="summary-grid">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>${ventaActual.subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row summary-discount">
            <span>Descuento:</span>
            <span>-${ventaActual.descuento.toFixed(2)}</span>
          </div>
          <div className="summary-row summary-total">
            <span>Total:</span>
            <span>${ventaActual.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button onClick={onProcesarVenta} className="generate-button">
        Generar Ticket de Venta
      </button>
    </div>
  );
};

// Componente Pantalla Catálogo
const PantallaCatalogo = ({ catalogo, onVolver }) => {
  const [mostrandoModal, setMostrandoModal] = useState(false);
  const [mostrandoModalNuevo, setMostrandoModalNuevo] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [catalogoLocal, setCatalogoLocal] = useState(catalogo);
  const [categorias, setCategorias] = useState([]);
  const [nuevoProducto, setNuevoProducto] = useState({
    nombre: '',
    descripcion: '',
    categoria_id: '',
    categoria_nueva: '',
    variantes: {
      bebe: { activa: true, precio_costo: 0, precio_venta: 0 },
      peque: { activa: true, precio_costo: 0, precio_venta: 0 },
      adulto: { activa: true, precio_costo: 0, precio_venta: 0 }
    }
  });

  useEffect(() => {
    setCatalogoLocal(catalogo);
    cargarCategorias();
  }, [catalogo]);

  const cargarCategorias = async () => {
    const { data } = await agregarProducto.obtenerCategorias();
    if (data) setCategorias(data);
  };

  const abrirModalEdicion = (producto) => {
    setProductoEditando({
      ...producto,
      precio_costo_temp: producto.precio_costo,
      precio_venta_temp: producto.precio_venta
    });
    setMostrandoModal(true);
  };

  const abrirModalNuevo = () => {
    setMostrandoModalNuevo(true);
  };

  const cerrarModal = () => {
    setMostrandoModal(false);
    setMostrandoModalNuevo(false);
    setProductoEditando(null);
    setNuevoProducto({
      nombre: '',
      descripcion: '',
      categoria_id: '',
      categoria_nueva: '',
      variantes: {
        bebe: { activa: true, precio_costo: 0, precio_venta: 0 },
        peque: { activa: true, precio_costo: 0, precio_venta: 0 },
        adulto: { activa: true, precio_costo: 0, precio_venta: 0 }
      }
    });
  };

  const calcularGananciaTemporal = () => {
    if (!productoEditando) return { ganancia: 0, margen: 0 };
    const ganancia = productoEditando.precio_venta_temp - productoEditando.precio_costo_temp;
    const margen = ((ganancia / productoEditando.precio_venta_temp) * 100).toFixed(2);
    return { ganancia: ganancia.toFixed(2), margen };
  };

  const calcularGananciaVariante = (variante) => {
    const ganancia = variante.precio_venta - variante.precio_costo;
    const margen = variante.precio_venta > 0 ? ((ganancia / variante.precio_venta) * 100).toFixed(1) : 0;
    return { ganancia: ganancia.toFixed(2), margen };
  };

  const guardarCambios = async () => {
    try {
      const { error } = await editarProducto.actualizarVariante(productoEditando.variante_id, {
        precio_costo: parseFloat(productoEditando.precio_costo_temp),
        precio_venta: parseFloat(productoEditando.precio_venta_temp)
      });

      if (error) throw error;

      // Actualizar el catálogo local
      const nuevoCatalogo = catalogoLocal.map(item => {
        if (item.variante_id === productoEditando.variante_id) {
          const nuevoPrecioCosto = parseFloat(productoEditando.precio_costo_temp);
          const nuevoPrecioVenta = parseFloat(productoEditando.precio_venta_temp);
          const nuevaGanancia = nuevoPrecioVenta - nuevoPrecioCosto;
          const nuevoMargen = ((nuevaGanancia / nuevoPrecioVenta) * 100).toFixed(2);
          
          return {
            ...item,
            precio_costo: nuevoPrecioCosto,
            precio_venta: nuevoPrecioVenta,
            ganancia_unitaria: nuevaGanancia,
            margen_porcentaje: nuevoMargen
          };
        }
        return item;
      });

      setCatalogoLocal(nuevoCatalogo);
      alert('Producto actualizado exitosamente');
      cerrarModal();
    } catch (error) {
      console.error('Error actualizando producto:', error);
      alert('Error al actualizar el producto: ' + error.message);
    }
  };

  const guardarNuevoProducto = async () => {
    try {
      let categoriaId = nuevoProducto.categoria_id;

      // Si se especificó una nueva categoría, crearla primero
      if (nuevoProducto.categoria_nueva.trim()) {
        const { data: nuevaCategoria, error: errorCategoria } = await agregarProducto.crearCategoria({
          nombre: nuevoProducto.categoria_nueva.trim(),
          descripcion: `Categoría para ${nuevoProducto.categoria_nueva.trim()}`,
          color: '#6B5B95'
        });

        if (errorCategoria) throw errorCategoria;
        categoriaId = nuevaCategoria[0].id;
      }

      if (!categoriaId) {
        alert('Por favor selecciona una categoría o especifica una nueva');
        return;
      }

      // Crear el producto
      const { data: productoCreado, error: errorProducto } = await agregarProducto.crearProducto({
        categoria_id: categoriaId,
        nombre: nuevoProducto.nombre.trim(),
        descripcion: nuevoProducto.descripcion.trim()
      });

      if (errorProducto) throw errorProducto;

      // Crear las variantes activas
      const variantes = [];
      const varianteNombres = { bebe: 'Bebé', peque: 'Peque', adulto: 'Adulto' };

      Object.entries(nuevoProducto.variantes).forEach(([key, variante]) => {
        if (variante.activa && variante.precio_venta > 0) {
          variantes.push({
            producto_id: productoCreado[0].id,
            nombre: varianteNombres[key],
            precio_costo: parseFloat(variante.precio_costo),
            precio_venta: parseFloat(variante.precio_venta)
          });
        }
      });

      if (variantes.length === 0) {
        alert('Debes activar al menos una variante con precio válido');
        return;
      }

      const { error: errorVariantes } = await agregarProducto.crearVariantes(variantes);
      if (errorVariantes) throw errorVariantes;

      alert('Producto creado exitosamente');
      cerrarModal();
      
      // Recargar el catálogo
      window.location.reload();
    } catch (error) {
      console.error('Error creando producto:', error);
      alert('Error al crear el producto: ' + error.message);
    }
  };

  const categoriasUnicas = [...new Set(catalogoLocal.map(item => item.categoria))];

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <button onClick={onVolver} className="back-button">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>
        <h2 className="catalog-title">Catálogo</h2>
      </div>

      <div className="space-y-4">
        {categoriasUnicas.map(categoria => {
          const productosCategoria = catalogoLocal.filter(item => item.categoria === categoria);
          const colorCategoria = productosCategoria[0]?.color_categoria || '#6B5B95';
          
          return (
            <div key={categoria} className="category-card">
              <div className="category-header">
                <div 
                  className="category-color-dot" 
                  style={{ backgroundColor: colorCategoria }}
                ></div>
                <h3 className="category-name">{categoria}</h3>
              </div>
              <div className="product-grid">
                {productosCategoria.map((item, index) => (
                  <div key={index} className="product-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div className="product-title">
                        {item.producto} - {item.variante}
                      </div>
                      <button 
                        onClick={() => abrirModalEdicion(item)}
                        className="edit-button"
                      >
                        Editar
                      </button>
                    </div>
                    <div className="product-info">
                      Costo: ${item.precio_costo} • Venta: ${item.precio_venta}
                    </div>
                    <div className="product-profit">
                      Ganancia: ${item.ganancia_unitaria} ({item.margen_porcentaje}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón flotante para agregar producto */}
      <button onClick={abrirModalNuevo} className="add-product-fab">
        +
      </button>

      {/* Modal de Edición */}
      {mostrandoModal && productoEditando && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Editar Producto</h3>
              <button onClick={cerrarModal} className="close-button">×</button>
            </div>

            <div className="form-section">
              <h4>Información del Producto</h4>
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: '#6b5b95' }}>
                  {productoEditando.producto} - {productoEditando.variante}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {productoEditando.categoria}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Precios</h4>
              <label className="input-label">Precio de Costo ($)</label>
              <input
                type="number"
                step="0.01"
                value={productoEditando.precio_costo_temp}
                onChange={(e) => setProductoEditando({
                  ...productoEditando,
                  precio_costo_temp: parseFloat(e.target.value) || 0
                })}
                className="edit-input"
                placeholder="0.00"
              />

              <label className="input-label">Precio de Venta ($)</label>
              <input
                type="number"
                step="0.01"
                value={productoEditando.precio_venta_temp}
                onChange={(e) => setProductoEditando({
                  ...productoEditando,
                  precio_venta_temp: parseFloat(e.target.value) || 0
                })}
                className="edit-input"
                placeholder="0.00"
              />

              <div className="profit-preview">
                Ganancia: ${calcularGananciaTemporal().ganancia} ({calcularGananciaTemporal().margen}%)
              </div>
            </div>

            <div className="modal-buttons">
              <button onClick={cerrarModal} className="cancel-button">
                Cancelar
              </button>
              <button onClick={guardarCambios} className="save-button">
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Nuevo Producto */}
      {mostrandoModalNuevo && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agregar Nuevo Producto</h3>
              <button onClick={cerrarModal} className="close-button">×</button>
            </div>

            <div className="form-section">
              <h4>Información Básica</h4>
              <label className="input-label">Nombre del Producto</label>
              <input
                type="text"
                value={nuevoProducto.nombre}
                onChange={(e) => setNuevoProducto({...nuevoProducto, nombre: e.target.value})}
                className="edit-input"
                placeholder="Ej: Relajante"
              />

              <label className="input-label">Descripción</label>
              <input
                type="text"
                value={nuevoProducto.descripcion}
                onChange={(e) => setNuevoProducto({...nuevoProducto, descripcion: e.target.value})}
                className="edit-input"
                placeholder="Ej: Para relajar y reducir el estrés"
              />
            </div>

            <div className="form-section">
              <h4>Categoría</h4>
              <label className="input-label">Seleccionar Categoría Existente</label>
              <select
                value={nuevoProducto.categoria_id}
                onChange={(e) => setNuevoProducto({...nuevoProducto, categoria_id: e.target.value})}
                className="category-select"
              >
                <option value="">Seleccionar categoría...</option>
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                ))}
              </select>

              <label className="input-label" style={{marginTop: '12px'}}>O Crear Nueva Categoría</label>
              <input
                type="text"
                value={nuevoProducto.categoria_nueva}
                onChange={(e) => setNuevoProducto({...nuevoProducto, categoria_nueva: e.target.value})}
                className="edit-input"
                placeholder="Nombre de nueva categoría"
              />
            </div>

            <div className="form-section">
              <h4>Variantes y Precios</h4>
              
              {Object.entries(nuevoProducto.variantes).map(([key, variante]) => {
                const nombres = { bebe: 'Bebé', peque: 'Peque', adulto: 'Adulto' };
                const { ganancia, margen } = calcularGananciaVariante(variante);
                
                return (
                  <div key={key} className={`variant-section ${!variante.activa ? 'disabled-variant' : ''}`}>
                    <div className="variant-header">
                      <h5 className="variant-title">{nombres[key]}</h5>
                      <input
                        type="checkbox"
                        checked={variante.activa}
                        onChange={(e) => setNuevoProducto({
                          ...nuevoProducto,
                          variantes: {
                            ...nuevoProducto.variantes,
                            [key]: { ...variante, activa: e.target.checked }
                          }
                        })}
                        className="variant-toggle"
                      />
                    </div>
                    
                    {variante.activa && (
                      <>
                        <div className="form-row">
                          <div>
                            <label className="input-label">Costo ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={variante.precio_costo}
                              onChange={(e) => setNuevoProducto({
                                ...nuevoProducto,
                                variantes: {
                                  ...nuevoProducto.variantes,
                                  [key]: { ...variante, precio_costo: parseFloat(e.target.value) || 0 }
                                }
                              })}
                              className="edit-input"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="input-label">Venta ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={variante.precio_venta}
                              onChange={(e) => setNuevoProducto({
                                ...nuevoProducto,
                                variantes: {
                                  ...nuevoProducto.variantes,
                                  [key]: { ...variante, precio_venta: parseFloat(e.target.value) || 0 }
                                }
                              })}
                              className="edit-input"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        {variante.precio_venta > 0 && (
                          <div style={{ fontSize: '12px', color: '#2ecc71', textAlign: 'center', marginTop: '4px' }}>
                            Ganancia: ${ganancia} ({margen}%)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-buttons">
              <button onClick={cerrarModal} className="cancel-button">
                Cancelar
              </button>
              <button onClick={guardarNuevoProducto} className="save-button">
                Crear Producto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente de Gestión de Promociones
const GestionPromociones = ({ onVolver }) => {
  const [promociones, setPromociones] = useState([]);
  const [mostrandoModal, setMostrandoModal] = useState(false);
  const [promocionEditando, setPromocionEditando] = useState(null);
  const [nuevaPromocion, setNuevaPromocion] = useState({
    nombre: '',
    tipo: 'porcentaje',
    valor: 0,
    compra_cantidad: 4,
    lleva_cantidad: 1,
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    activo: true
  });

  useEffect(() => {
    cargarPromociones();
  }, []);

  const cargarPromociones = async () => {
    const { data } = await gestionarPromociones.obtenerTodas();
    if (data) setPromociones(data);
  };

  const abrirModalNueva = () => {
    setPromocionEditando(null);
    setNuevaPromocion({
      nombre: '',
      tipo: 'porcentaje',
      valor: 0,
      descripcion: '',
      fecha_inicio: '',
      fecha_fin: '',
      activo: true
    });
    setMostrandoModal(true);
  };

  const abrirModalEdicion = (promocion) => {
    setPromocionEditando(promocion);
    setNuevaPromocion({
      nombre: promocion.nombre,
      tipo: promocion.tipo,
      valor: promocion.valor,
      compra_cantidad: promocion.compra_cantidad || 4,
      lleva_cantidad: promocion.lleva_cantidad || 1,
      descripcion: promocion.descripcion || '',
      fecha_inicio: promocion.fecha_inicio || '',
      fecha_fin: promocion.fecha_fin || '',
      activo: promocion.activo
    });
    setMostrandoModal(true);
  };

  const cerrarModal = () => {
    setMostrandoModal(false);
    setPromocionEditando(null);
    setNuevaPromocion({
      nombre: '',
      tipo: 'porcentaje',
      valor: 0,
      compra_cantidad: 4,
      lleva_cantidad: 1,
      descripcion: '',
      fecha_inicio: '',
      fecha_fin: '',
      activo: true
    });
  };

  const togglePromocion = async (id, nuevoEstado) => {
    try {
      await gestionarPromociones.toggleActivo(id, nuevoEstado);
      cargarPromociones();
    } catch (error) {
      console.error('Error al cambiar estado de promoción:', error);
    }
  };

  const guardarPromocion = async () => {
    try {
      if (!nuevaPromocion.nombre.trim()) {
        alert('El nombre es requerido');
        return;
      }

      if (nuevaPromocion.valor <= 0) {
        alert('El valor debe ser mayor a 0');
        return;
      }

      const datosPromocion = {
        nombre: nuevaPromocion.nombre.trim(),
        tipo: nuevaPromocion.tipo,
        valor: parseFloat(nuevaPromocion.valor),
        descripcion: nuevaPromocion.descripcion.trim(),
        fecha_inicio: nuevaPromocion.fecha_inicio || null,
        fecha_fin: nuevaPromocion.fecha_fin || null,
        activo: nuevaPromocion.activo
      };

      if (promocionEditando) {
        await gestionarPromociones.actualizar(promocionEditando.id, datosPromocion);
        alert('Promoción actualizada exitosamente');
      } else {
        await gestionarPromociones.crear(datosPromocion);
        alert('Promoción creada exitosamente');
      }

      cargarPromociones();
      cerrarModal();
    } catch (error) {
      console.error('Error guardando promoción:', error);
      alert('Error al guardar la promoción: ' + error.message);
    }
  };

  const tiposPromocion = {
    porcentaje: 'Descuento %',
    cantidad_fija: 'Descuento Fijo',
    producto_gratis: 'Producto Gratis'
  };

  const formatearValor = (tipo, valor, promocion) => {
    switch (tipo) {
      case 'porcentaje': return `${valor}%`;
      case 'cantidad_fija': return `$${valor}`;
      case 'producto_gratis': 
        if (promocion && promocion.compra_cantidad) {
          return `Compra ${promocion.compra_cantidad} lleva ${valor} gratis`;
        }
        return `${valor} gratis`;
      default: return valor;
    }
  };

  return (
    <div className="promotions-container">
      <div className="promotions-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={onVolver} className="back-button">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          <h2 className="catalog-title">Promociones</h2>
        </div>
        <button onClick={abrirModalNueva} className="add-promotion-button">
          + Nueva
        </button>
      </div>

      <div>
        {promociones.map(promocion => (
          <div key={promocion.id} className={`promotion-card ${!promocion.activo ? 'inactive' : ''}`}>
            <div className="promotion-header">
              <div>
                <h3 className="promotion-name">{promocion.nombre}</h3>
                <span className={`promotion-type-badge type-${promocion.tipo}`}>
                  {tiposPromocion[promocion.tipo]}
                </span>
              </div>
              <div className="promotion-actions">
                <button onClick={() => abrirModalEdicion(promocion)} className="edit-button">
                  Editar
                </button>
                <div 
                  className={`toggle-switch ${promocion.activo ? 'active' : ''}`}
                  onClick={() => togglePromocion(promocion.id, !promocion.activo)}
                >
                  <div className="toggle-slider"></div>
                </div>
              </div>
            </div>
            
            <div className="promotion-value">
              {formatearValor(promocion.tipo, promocion.valor, promocion)}
            </div>
            
            {promocion.descripcion && (
              <div className="promotion-description">{promocion.descripcion}</div>
            )}
            
            {(promocion.fecha_inicio || promocion.fecha_fin) && (
              <div className="promotion-description">
                {promocion.fecha_inicio && `Desde: ${new Date(promocion.fecha_inicio).toLocaleDateString()}`}
                {promocion.fecha_inicio && promocion.fecha_fin && ' • '}
                {promocion.fecha_fin && `Hasta: ${new Date(promocion.fecha_fin).toLocaleDateString()}`}
              </div>
            )}
          </div>
        ))}

        {promociones.length === 0 && (
          <div className="section-card" style={{ textAlign: 'center', color: '#6b7280' }}>
            No hay promociones creadas. Crea la primera promoción usando el botón "+ Nueva"
          </div>
        )}
      </div>

      {/* Modal de Crear/Editar Promoción */}
      {mostrandoModal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {promocionEditando ? 'Editar Promoción' : 'Nueva Promoción'}
              </h3>
              <button onClick={cerrarModal} className="close-button">×</button>
            </div>

            <div className="form-section">
              <h4>Información Básica</h4>
              <label className="input-label">Nombre de la Promoción</label>
              <input
                type="text"
                value={nuevaPromocion.nombre}
                onChange={(e) => setNuevaPromocion({...nuevaPromocion, nombre: e.target.value})}
                className="edit-input"
                placeholder="Ej: Descuento de Temporada"
              />

              <label className="input-label">Descripción (Opcional)</label>
              <input
                type="text"
                value={nuevaPromocion.descripcion}
                onChange={(e) => setNuevaPromocion({...nuevaPromocion, descripcion: e.target.value})}
                className="edit-input"
                placeholder="Ej: Válido solo en fin de semana"
              />
            </div>

            <div className="form-section">
              <h4>Tipo y Valor</h4>
              <label className="input-label">Tipo de Promoción</label>
              <select
                value={nuevaPromocion.tipo}
                onChange={(e) => setNuevaPromocion({...nuevaPromocion, tipo: e.target.value})}
                className="category-select"
              >
                <option value="porcentaje">Descuento por Porcentaje (%)</option>
                <option value="cantidad_fija">Descuento Cantidad Fija ($)</option>
                <option value="producto_gratis">Producto Gratis (Compra X lleva Y)</option>
              </select>

              {/* Campos dinámicos según el tipo */}
              {nuevaPromocion.tipo === 'porcentaje' && (
                <>
                  <label className="input-label">Porcentaje de Descuento (%)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={nuevaPromocion.valor}
                    onChange={(e) => setNuevaPromocion({...nuevaPromocion, valor: parseFloat(e.target.value) || 0})}
                    className="edit-input"
                    placeholder="10"
                  />
                  <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                    Ejemplo: 15% de descuento en toda la compra
                  </div>
                </>
              )}

              {nuevaPromocion.tipo === 'cantidad_fija' && (
                <>
                  <label className="input-label">Cantidad de Descuento ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={nuevaPromocion.valor}
                    onChange={(e) => setNuevaPromocion({...nuevaPromocion, valor: parseFloat(e.target.value) || 0})}
                    className="edit-input"
                    placeholder="50.00"
                  />
                  <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                    Ejemplo: $50 de descuento en la compra total
                  </div>
                </>
              )}

              {nuevaPromocion.tipo === 'producto_gratis' && (
                <>
                  <div className="form-row">
                    <div>
                      <label className="input-label">Compra (X productos)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={nuevaPromocion.compra_cantidad || 4}
                        onChange={(e) => setNuevaPromocion({
                          ...nuevaPromocion, 
                          compra_cantidad: parseInt(e.target.value) || 1
                        })}
                        className="edit-input"
                        placeholder="4"
                      />
                    </div>
                    <div>
                      <label className="input-label">Lleva (Y productos gratis)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={nuevaPromocion.lleva_cantidad || 1}
                        onChange={(e) => setNuevaPromocion({
                          ...nuevaPromocion, 
                          lleva_cantidad: parseInt(e.target.value) || 1,
                          valor: parseInt(e.target.value) || 1
                        })}
                        className="edit-input"
                        placeholder="1"
                      />
                    </div>
                  </div>
                  <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                    Ejemplo: Compra {nuevaPromocion.compra_cantidad || 4} productos y lleva {nuevaPromocion.lleva_cantidad || 1} gratis
                  </div>
                </>
              )}
            </div>

            <div className="form-section">
              <h4>Vigencia (Opcional)</h4>
              <div className="date-range">
                <div>
                  <label className="input-label">Fecha Inicio</label>
                  <input
                    type="date"
                    value={nuevaPromocion.fecha_inicio}
                    onChange={(e) => setNuevaPromocion({...nuevaPromocion, fecha_inicio: e.target.value})}
                    className="date-input"
                  />
                </div>
                <div>
                  <label className="input-label">Fecha Fin</label>
                  <input
                    type="date"
                    value={nuevaPromocion.fecha_fin}
                    onChange={(e) => setNuevaPromocion({...nuevaPromocion, fecha_fin: e.target.value})}
                    className="date-input"
                  />
                </div>
              </div>
            </div>

            <div className="modal-buttons">
              <button onClick={cerrarModal} className="cancel-button">
                Cancelar
              </button>
              <button onClick={guardarPromocion} className="save-button">
                {promocionEditando ? 'Actualizar' : 'Crear'} Promoción
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente Bottom Navigation
const BottomNav = ({ pantalla, setPantalla }) => (
  <nav className="bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0 }}>
    <div style={{ maxWidth: '28rem', margin: '0 auto', display: 'flex' }}>
      <button
        onClick={() => setPantalla('dashboard')}
        className={`nav-button ${pantalla === 'dashboard' ? 'active' : ''}`}
      >
        <svg className="nav-icon text-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path>
        </svg>
        <span className="nav-text text-purple">Inicio</span>
      </button>
      <button
        onClick={() => setPantalla('ventas')}
        className={`nav-button ${pantalla === 'ventas' ? 'active' : ''}`}
      >
        <svg className="nav-icon text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
        </svg>
        <span className="nav-text text-green">Ventas</span>
      </button>
      <button
        onClick={() => setPantalla('catalogo')}
        className={`nav-button ${pantalla === 'catalogo' ? 'active' : ''}`}
      >
        <svg className="nav-icon text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
        </svg>
        <span className="nav-text text-blue">Catálogo</span>
      </button>
      <button
        onClick={() => setPantalla('promociones')}
        className={`nav-button ${pantalla === 'promociones' ? 'active' : ''}`}
      >
        <svg className="nav-icon" fill="none" stroke="#e91e63" viewBox="0 0 24 24" style={{width: '24px', height: '24px'}}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"></path>
        </svg>
        <span className="nav-text" style={{color: '#e91e63'}}>Promociones</span>
      </button>
    </div>
  </nav>
);