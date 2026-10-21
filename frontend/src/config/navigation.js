import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Wallet,
  Truck,
  PackagePlus,
  Warehouse,
  Package,
  Users,
  BarChart3,
  ScrollText,
  UserCog,
  Shield,
} from "lucide-react";

/**
 * Menú lateral agrupado. `roles` define quién ve cada ítem.
 * Lo que el rol no puede ver no se renderiza.
 */
export const NAV_GROUPS = [
  {
    id: "principal",
    label: "Principal",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/menu",
        icon: LayoutDashboard,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
    ],
  },
  {
    id: "operaciones",
    label: "Operaciones",
    items: [
      {
        id: "pedidos",
        label: "Pedidos",
        path: "/pedidos",
        icon: ShoppingCart,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
      {
        id: "ventas",
        label: "Ventas",
        path: "/ventas",
        icon: Receipt,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
      {
        id: "pagos",
        label: "Pagos",
        path: "/pagos",
        icon: Wallet,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
    ],
  },
  {
    id: "abastecimiento",
    label: "Abastecimiento",
    items: [
      {
        id: "proveedores",
        label: "Proveedores",
        path: "/proveedores",
        icon: Truck,
        roles: ["ADMINISTRADOR", "SUPERVISOR"],
      },
      {
        id: "compras",
        label: "Compras",
        path: "/compras",
        icon: PackagePlus,
        roles: ["ADMINISTRADOR", "SUPERVISOR"],
      },
      {
        id: "inventario",
        label: "Movimientos",
        path: "/inventario",
        icon: Warehouse,
        roles: ["ADMINISTRADOR", "SUPERVISOR"],
      },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    items: [
      {
        id: "productos",
        label: "Productos",
        path: "/productos",
        icon: Package,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
      {
        id: "clientes",
        label: "Clientes",
        path: "/clientes",
        icon: Users,
        roles: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
      },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    items: [
      {
        id: "reportes",
        label: "Reportes",
        path: "/reportes",
        icon: BarChart3,
        roles: ["ADMINISTRADOR", "SUPERVISOR"],
        soon: true,
      },
      {
        id: "auditoria",
        label: "Auditoría",
        path: "/auditoria",
        icon: ScrollText,
        roles: ["ADMINISTRADOR"],
      },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    items: [
      {
        id: "usuarios",
        label: "Usuarios",
        path: "/usuarios",
        icon: UserCog,
        roles: ["ADMINISTRADOR"],
      },
      {
        id: "roles",
        label: "Roles y permisos",
        path: "/roles",
        icon: Shield,
        roles: ["ADMINISTRADOR"],
        soon: true,
      },
    ],
  },
];

export function menuParaRol(rol) {
  if (!rol) return [];

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(rol)),
  })).filter((group) => group.items.length > 0);
}

export const ETIQUETA_ROL = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  OPERADOR: "Operador",
};
