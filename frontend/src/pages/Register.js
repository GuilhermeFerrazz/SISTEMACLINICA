import React from 'react';
import { Navigate } from 'react-router-dom';

// Registro público desabilitado.
// Novos usuários são criados pelo administrador em /admin/users.
const Register = () => <Navigate to="/login" replace />;

export default Register;
