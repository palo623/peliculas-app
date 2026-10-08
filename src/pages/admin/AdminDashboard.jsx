/**
 * AdminDashboard - Panel principal para administradores
 * 
 * Recibe el objeto `user` autenticado y un booleano `admin` indicando
 * si el usuario tiene permisos de administrador. La verificación real
 * se realiza en el backend (authService.isAdmin).
 * 
 * Features:
 - Ruta protegida: solo muestra contenido si `admin={true}`
 - Header con título y descripción
 - Sección de resumen con cards placeholder
 - Sección de gestión con opciones "Próximamente"
 - Sección de actividad reciente con datos de ejemplo
 - Diseño responsive y limpio
 */

import React, { useEffect, useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import "bootstrap/dist/bootstrap.min.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faFileInvoice, faChartBar, faUsersGear, faMagnifyingGlass, faRedo } from "@fortawesome/free-solid-icons";

// ---------------------------------------------------
// Helper: Verificar si el usuario es administrador (lado cliente)
// Usa la misma lógica que authService.isAdmin en el backend
// ---------------------------------------------------
const clientSideIsAdmin = (user) => {
  if (!user) return false;
  // 1. Revisar campo role en prefs
  const userRole = (user.prefs && user.prefs.role) || "";
  if (userRole && userRole.toString().trim().toLowerCase() === "admin") return true;
  // 2. Revisar email de administrador
  const adminEmails = ["admin@test.com", "admin@example.com"];
  if (adminEmails.includes(user.email)) return true;
  // 3. Revisar nickname
  if (user.nickname && user.nickname.toString().toLowerCase().includes("admin")) return true;
  return false;
};

// ---------------------------------------------------
// Componente AdminDashboard
// ---------------------------------------------------
const AdminDashboard = ({ user, admin }) => {
  // Si no hay usuario o no es admin, redirigir al inicio
  if (!user || !admin) {
    // En un caso real, aquí haría onNavigate("inicio")
    return null;
  }

  const [showNav, setShowNav] = useState(false);

  // Datos temporales para el dashboard
  const stats = {
    totalUsers: 128,
    totalReviews: 47,
    positiveReviews: 38,
    negativeReviews: 9,
  };

  // Datos de actividad reciente (ejemplo)
  const recentActivity = [
    { user: "usuario1", accion: "Nueva reseña publicada", fecha: "Hoy 10:30" },
    { user: "usuario2", accion: "Modificación de perfil", fecha: "Ayer 14:20" },
    { user: "usuario3", accion: "Eliminación de reseña", fecha: "02/08 09:45" },
    { user: "usuario4", accion: "Cambio de género favorito", fecha: "01/08 18:10" },
  ];

  return (
    <div className="admin-dashboard min-vh-100">
      {/* Header */}
      <header className="py-4 bg-primary text-white">
        <div className="container">
          <h2 className="mb-0">Panel de Administración</h2>
          <p className="lead mb-0">
            Desde aquí se pueden administrar las reviews y consultar estadísticas del
            sistema. Las opciones disponibles serán activadas progresivamente.
          </p>
        </div>
      </header>

      {/* Sección de Resumen - Cards */}
      <section className="py-5">
        <div className="container">
          <h4 className="mb-4 text-center">Resumen General</h4>
          <Row className="g-4 justify-content-center">
            <Col md={4} lg={3}>
              <div className="card h-100 border-secondary">
                <div className="card-body">
                  <h5 className="card-title">Total de Usuarios</h5>
                  <h3 className="card-text fw-bold">{stats.totalUsers}</h3>
                  <small className="text-muted">usuarios registrados</small>
                </div>
              </div>
            </Col>
            <Col md={4} lg={3}>
              <div className="card h-100 border-secondary">
                <div className="card-body">
                  <h5 className="card-title">Total de Reseñas</h5>
                  <h3 className="card-text fw-bold">{stats.totalReviews}</h3>
                  <small className="text-muted">reseñas en el sistema</small>
                </div>
              </div>
            </Col>
            <Col md={4} lg={3}>
              <div className="card h-100 border-secondary">
                <div className="card-body">
                  <h5 className="card-title">Reviews Positivas</h5>
                  <h3 className="card-text fw-bold">{stats.positiveReviews}</h3>
                  <small className="text-muted">con calificación alta</small>
                </div>
              </div>
            </Col>
            <Col md={4} lg={3}>
              <div className="card h-100 border-secondary">
                <div className="card-body">
                  <h5 className="card-title">Reviews Negativas</h5>
                  <h3 className="card-text fw-bold">{stats.negativeReviews}</h3>
                  <small className="text-muted">con calificación baja</small>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      {/* Sección de Gestión */}
      <section className="py-5 bg-light">
        <div className="container">
          <h4 className="mb-4">Gestión</h4>
          <Row className="g-3">
            <Col md={6}>
              <div className="card border-secondary">
                <div className="card-body text-center">
                  <FontAwesomeIcon icon={faFileInvoice} size="2x" className="mb-3 text-secondary"/>
                  <h5 className="card-title">Gestión de Reviews</h5>
                  <p className="card-text small">Próximamente</p>
                </div>
              </div>
            </Col>
            <Col md={6}>
              <div className="card border-secondary">
                <div className="card-body text-center">
                  <FontAwesomeIcon icon={faChartBar} size="2x" className="mb-3 text-secondary"/>
                  <h5 className="card-title">Estadísticas</h5>
                  <p className="card-text small">Próximamente</p>
                </div>
              </div>
            </Col>
            <Col md={6}>
              <div className="card border-secondary">
                <div className="card-body text-center">
                  <FontAwesomeIcon icon={faMagnifyingGlass} size="2x" className="mb-3 text-secondary"/>
                  <h5 className="card-title">Análisis de Sentimiento</h5>
                  <p className="card-text small">Próximamente</p>
                </div>
              </div>
            </Col>
            <Col md={6}>
              <div className="card border-secondary">
                <div className="card-body text-center">
                  <FontAwesomeIcon icon={faUsersGear} size="2x" className="mb-3 text-secondary"/>
                  <h5 className="card-title">Gestión de Usuarios</h5>
                  <p className="card-text small">Próximamente</p>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      {/* Sección de Actividad Reciente */}
      <section className="py-5">
        <div className="container">
          <h4 className="mb-4">Actividad Reciente</h4>
          <Row>
            <Col>
              <div className="table-responsive">
                <table className="table table-bordered table-sm">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Acción</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((item, index) => (
                      <tr key={index}>
                        <td>{item.user}</td>
                        <td>{item.accion}</td>
                        <td>{item.fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Col>
          </Row>
        </div>
      </section>
    </div>
  );
};

// ---------------------------------------------------
// Exportar componente
// ---------------------------------------------------
export default AdminDashboard;