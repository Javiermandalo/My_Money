const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const DB_CATEGORIAS = process.env.NOTION_DB_CATEGORIAS;
const DB_TRANSACCIONES = process.env.NOTION_DB_TRANSACCIONES;
const DB_SUSCRIPCIONES = process.env.NOTION_DB_SUSCRIPCIONES;
const DB_CONTROL = process.env.NOTION_DB_CONTROL;

async function obtenerCategorias() {
  try {
    const response = await notion.databases.query({
      database_id: DB_CATEGORIAS,
    });
    return response.results.map((page) => ({
      id: page.id,
      nombre: page.properties.Nombre.title[0]?.plain_text || '',
      tipo: page.properties.Tipo.select?.name || 'Gasto',
      presupuesto: page.properties.Presupuesto.number || 0,
    }));
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return [];
  }
}

async function crearTransaccion(concepto, monto, categoriaNombre) {
  try {
    const categorias = await obtenerCategorias();
    const categoria = categorias.find((c) => c.nombre.toLowerCase() === categoriaNombre.toLowerCase());

    const properties = {
      Concepto: {
        title: [
          {
            text: {
              content: concepto,
            },
          },
        ],
      },
      Monto: {
        number: parseFloat(monto),
      },
      Fecha: {
        date: {
          start: new Date().toISOString().split('T')[0],
        },
      },
    };

    if (categoria) {
      properties.Categoría = {
        relation: [
          {
            id: categoria.id,
          },
        ],
      };
    }

    const response = await notion.pages.create({
      parent: {
        database_id: DB_TRANSACCIONES,
      },
      properties,
    });

    return response;
  } catch (error) {
    console.error('Error al crear transacción:', error);
    throw error;
  }
}

async function obtenerSuscripciones() {
  try {
    const response = await notion.databases.query({
      database_id: DB_SUSCRIPCIONES,
    });
    return response.results.map((page) => ({
      id: page.id,
      servicio: page.properties.Servicio.title[0]?.plain_text || '',
      costo: page.properties.Costo.number || 0,
      cobro: page.properties['Cobro Mensual'].date?.start || null,
      estado: page.properties.Estado.checkbox || false,
    }));
  } catch (error) {
    console.error('Error al obtener suscripciones:', error);
    return [];
  }
}

module.exports = {
  obtenerCategorias,
  crearTransaccion,
  obtenerSuscripciones,
  notion,
  DB_CATEGORIAS,
  DB_TRANSACCIONES,
  DB_SUSCRIPCIONES,
  DB_CONTROL,
};
