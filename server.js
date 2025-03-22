const express = require("express");
const axios = require("axios");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
    secret: "skillfinder_secret_key",
    resave: false,
    saveUninitialized: true
}));

// Conexión MySQL
const connection = mysql.createConnection({
    host: "sql5.freesqldatabase.com",
    user: "	sql5769027",
    password: "7zWTErI4u7",
    database: "sql5769027"
});

connection.connect(err => {
    if (err) {
        console.error("❌ Error al conectar a MySQL:", err);
        return;
    }
    console.log("✅ Conectado a la base de datos MySQL");
});

// Registro de usuario
app.post("/api/registro", async (req, res) => {
    const { usuario, email, password, intereses } = req.body;

    if (!usuario || !email || !password || intereses.length < 3) {
        return res.status(400).json({ success: false, message: "Faltan datos o intereses insuficientes" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        connection.query(
            "INSERT INTO Users (user, email, password, interest1, interest2, interest3) VALUES (?, ?, ?, ?, ?, ?)",
            [usuario, email, hashedPassword, intereses[0], intereses[1], intereses[2]],
            (err, results) => {
                if (err) {
                    console.error("❌ Error al registrar usuario:", err);
                    return res.status(500).json({ success: false, message: "Error al registrar usuario", error: err });
                }
                res.json({ success: true, message: "✅ Usuario registrado correctamente" });
            }
        );
    } catch (error) {
        console.error("❌ Error en el servidor:", error);
        res.status(500).json({ success: false, message: "Error interno" });
    }
});

// Inicio de sesión
app.post("/api/login", (req, res) => {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
        return res.status(400).json({ success: false, message: "Faltan datos" });
    }

    connection.query(
        "SELECT * FROM Users WHERE user = ?",
        [usuario],
        async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Error en la base de datos" });
            }

            if (results.length === 0) {
                return res.status(401).json({ success: false, message: "Usuario no encontrado" });
            }

            const user = results[0];
            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: "Contraseña incorrecta" });
            }

            req.session.userId = user.id;
            res.json({ success: true, message: "✅ Inicio de sesión exitoso" });
        }
    );
});

// Obtener perfil
app.get("/api/perfil", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    connection.query(
        "SELECT id, user, email, interest1, interest2, interest3 FROM Users WHERE id = ?",
        [req.session.userId],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ success: false, message: "Error al obtener perfil" });
            }
            res.json(results[0]);
        }
    );
});

// Actualizar intereses
app.post("/api/perfil/intereses", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const { intereses } = req.body;
    if (!Array.isArray(intereses) || intereses.length < 3) {
        return res.status(400).json({ success: false, message: "Lista de intereses inválida (deben ser 3)" });
    }

    connection.query(
        "UPDATE Users SET interest1 = ?, interest2 = ?, interest3 = ? WHERE id = ?",
        [intereses[0], intereses[1], intereses[2], req.session.userId],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Error al actualizar intereses" });
            }
            res.json({ success: true, message: "✅ Intereses actualizados correctamente" });
        }
    );
});

// Guardar curso
app.post("/api/cursos/guardar", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const { name, plataforma, url, estado } = req.body;

    if (!name || !plataforma || !url) {
        return res.status(400).json({ success: false, message: "Faltan datos del curso" });
    }

    const query = `
        INSERT INTO Courses (user_id, name, plataforma, url, estado)
        VALUES (?, ?, ?, ?, ?)
    `;

    console.log("📌 Datos que se van a insertar:", {
        user_id: req.session.userId,
        name,
        plataforma,
        url,
        estado
    });

    connection.query(query, [req.session.userId, name, plataforma, url, estado || "guardado"], (err, results) => {
        if (err) {
            console.error("❌ Error al guardar curso:", err);
            return res.status(500).json({ success: false, message: "Error al guardar el curso" });
        }
        res.json({ success: true, message: "✅ Curso guardado correctamente" });
    });
});

// Marcar curso como finalizado
app.post("/api/cursos/finalizar", (req, res) => {
    const { url } = req.body;

    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    connection.query(
        "UPDATE Courses SET estado = 'finalizado' WHERE user_id = ? AND url = ?",
        [req.session.userId, url],
        (err) => {
            if (err) {
                console.error("❌ Error al finalizar curso:", err);
                return res.status(500).json({ success: false, message: "Error al finalizar curso" });
            }
            res.json({ success: true, message: "✅ Curso marcado como finalizado" });
        }
    );
});

app.get("/api/cursos", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    connection.query(
        "SELECT name, plataforma, url, estado FROM Courses WHERE user_id = ?",
        [req.session.userId],
        (err, results) => {
            if (err) {
                console.error("❌ Error al obtener cursos:", err);
                return res.status(500).json({ success: false, message: "Error al obtener cursos" });
            }
            res.json({ success: true, cursos: results });
        }
    );
});

// Cerrar sesión
app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: "✅ Sesión cerrada" });
});

app.post("/filtrar-cursos", async (req, res) => {
    const { precio, idioma, q } = req.body;
    const apiKey = "9624900be173d3dee2abd9eced069cce858eb6bc0733af0d73619fe7767c7399";
  
    // Traducciones por idioma
    const traducciones = {
      es: {
        curso: "curso online sobre",
        gratuito: "gratuito",
        pago: "de pago"
      },
      en: {
        curso: "online course about",
        gratuito: "free",
        pago: "paid"
      },
      fr: {
        curso: "cours en ligne sur",
        gratuito: "gratuit",
        pago: "payant"
      },
      de: {
        curso: "Online-Kurs über",
        gratuito: "kostenlos",
        pago: "kostenpflichtig"
      }
    };
  
    const lang = traducciones[idioma] || traducciones["es"];
  
    // Construir frase base
    let consulta = `${lang.curso} ${q}`;
  
    // Agregar precio si aplica
    if (precio === "gratis") {
      consulta += ` ${lang.gratuito}`;
    } else if (precio === "pago") {
      consulta += ` ${lang.pago}`;
    }
  
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(consulta)}&engine=google&api_key=${apiKey}`;
    console.log("🔎 Consulta enviada a SerpAPI:", consulta); // 👈 Aquí verás la consulta
  
    try {
      const response = await axios.get(url);
      res.json(response.data);
    } catch (error) {
      console.error("❌ Error en filtrado de cursos:", error.message);
      res.status(500).json({ error: "No se pudieron obtener los cursos filtrados." });
    }
  });

// Búsqueda sin filtros pero enfocada a cursos
app.get("/buscar-cursos", async (req, res) => {
    const query = req.query.q;
    const apiKey = "9624900be173d3dee2abd9eced069cce858eb6bc0733af0d73619fe7767c7399";

    if (!query) {
        return res.status(400).json({ error: "Falta parámetro de búsqueda" });
    }

    const consultaFinal = `curso online sobre ${query}`;
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(consultaFinal)}&engine=google&api_key=${apiKey}`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error("❌ Error al buscar cursos:", error);
        res.status(500).json({ error: "No se pudieron obtener los cursos" });
    }
});

// Obtener mensajes del foro
app.get("/api/foro/mensajes", (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });

    const query = `
        SELECT Foro.mensaje, Foro.fecha, Users.user, Foro.user_id
        FROM Foro
        JOIN Users ON Foro.user_id = Users.id
        ORDER BY Foro.fecha ASC
    `;

    connection.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });

        const mensajes = results.map(m => ({
            mensaje: m.mensaje,
            fecha: m.fecha,
            user: m.user,
            propietario: m.user_id === req.session.userId
        }));

        res.json({ success: true, mensajes });
    });
});

// Enviar mensaje al foro
app.post("/api/foro/mensajes", (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });

    const { mensaje } = req.body;
    if (!mensaje || mensaje.trim() === "") return res.status(400).json({ success: false });

    const query = "INSERT INTO Foro (user_id, mensaje) VALUES (?, ?)";
    connection.query(query, [req.session.userId, mensaje], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});
  

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: "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" // tu clave
});

app.get("/api/recomendaciones", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }

  connection.query(
    "SELECT interest1, interest2, interest3 FROM Users WHERE id = ?",
    [req.session.userId],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(500).json({ success: false, message: "Error al obtener intereses" });
      }

      const mapa = {
        1: "Administración", 2: "Economía", 3: "Tecnología", 4: "Fotografía",
        5: "Cocina", 6: "Jardinería", 7: "Publicidad", 8: "Diseño Gráfico",
        9: "Programación", 10: "Idiomas", 11: "Emprendimiento", 12: "Marketing"
      };

      const intereses = results[0];
      const temas = [mapa[intereses.interest1], mapa[intereses.interest2], mapa[intereses.interest3]].join(", ");
      const serpApiKey = "9624900be173d3dee2abd9eced069cce858eb6bc0733af0d73619fe7767c7399";
      const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent("curso online sobre " + temas)}&engine=google&api_key=${serpApiKey}`;

      try {
        const serpRes = await axios.get(serpUrl);
        const resultados = serpRes.data.organic_results?.slice(0, 8) || [];

        const systemPrompt = `Eres un asistente que analiza cursos educativos encontrados en internet. Tu tarea es: 
1. Organizar los cursos por relevancia.
2. Reescribir las descripciones de forma atractiva.
3. Asignar una calificación del 1 al 5 según popularidad.
Devuelve un JSON con este formato:
[
  {
    "titulo": "...",
    "descripcion": "...",
    "url": "...",
    "imagen": "...",
    "calificacion": 4
  }
]`;

        const userPrompt = JSON.stringify(resultados.map(curso => ({
            titulo: curso.title,
            descripcion: curso.snippet || "",
            url: curso.link,
            imagen: curso.pagemap?.cse_thumbnail?.[0]?.src || "https://via.placeholder.com/150"
        })));

        const gptResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        });

        
        const texto = gptResponse.choices[0].message.content;
        console.log("🔍 Respuesta cruda de ChatGPT:", texto);  // <---- AÑADE ESTO

        const cursosGPT = JSON.parse(texto);

        res.json({ success: true, cursos: cursosGPT });
      } catch (error) {
        console.error("❌ Error en recomendación:", error.message);
        res.status(500).json({ success: false, message: "Error al obtener recomendaciones" });
      }
    }
  );
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
