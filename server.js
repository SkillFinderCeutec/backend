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
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Conexión SQL
const { createClient } = require("@libsql/client");

const client = createClient({
  url: "file:local.db",
  syncUrl: "https://doctria-skillfinderceutec.aws-us-west-2.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NDMyNTIwNDUsImlkIjoiOTIyZjk4MjgtOTY4Yi00NzAyLTgxNzMtNWUxY2JhNzk0OGY3IiwicmlkIjoiYzJjMDA0MzItMDU1Ni00YTRhLTk4ZjItZTIyMzk0NTQyMjFlIn0.WNrZlTQ8J0D11U6DEhIU3C2QAOtV51DG8PAu_eWNlNmeeGHULdz8nF5InaAeEDOefYsFF7pU4YVHDmb5_Qz-Aw",
});

// Registro de usuario
app.post("/api/registro", async (req, res) => {
    const { usuario, email, password, intereses } = req.body;

    if (!usuario || !email || !password || !Array.isArray(intereses) || intereses.length < 3) {
        return res.status(400).json({ success: false, message: "Faltan datos o intereses insuficientes" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await client.execute({
            sql: `INSERT INTO Users (user, email, password, interest1, interest2, interest3)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [usuario, email, hashedPassword, intereses[0], intereses[1], intereses[2]]
        });

        res.json({ success: true, message: "✅ Usuario registrado correctamente" });

    } catch (error) {
        console.error("❌ Error al registrar usuario:", error);
        res.status(500).json({ success: false, message: "Error al registrar usuario", error });
    }
});

// Inicio de sesión
app.post("/api/login", async (req, res) => {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
        return res.status(400).json({ success: false, message: "Faltan datos" });
    }

    try {
        const result = await client.execute({
            sql: "SELECT * FROM Users WHERE user = ?",
            args: [usuario],
        });

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: "Usuario no encontrado" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta" });
        }

        req.session.userId = user.id;
        res.json({ success: true, message: "✅ Inicio de sesión exitoso" });

    } catch (err) {
        console.error("❌ Error al iniciar sesión:", err);
        res.status(500).json({ success: false, message: "Error en el servidor" });
    }
});

// Obtener perfil
app.get("/api/perfil", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    try {
        const result = await client.execute({
            sql: "SELECT id, user, email, interest1, interest2, interest3 FROM Users WHERE id = ?",
            args: [req.session.userId],
        });

        const perfil = result.rows[0];
        if (!perfil) {
            return res.status(404).json({ success: false, message: "Perfil no encontrado" });
        }

        res.json(perfil);
    } catch (err) {
        console.error("❌ Error al obtener perfil:", err);
        res.status(500).json({ success: false, message: "Error al obtener perfil" });
    }
});

// Actualizar intereses
app.post("/api/perfil/intereses", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const { intereses } = req.body;
    if (!Array.isArray(intereses) || intereses.length < 3) {
        return res.status(400).json({ success: false, message: "Lista de intereses inválida (deben ser 3)" });
    }

    try {
        await client.execute({
            sql: "UPDATE Users SET interest1 = ?, interest2 = ?, interest3 = ? WHERE id = ?",
            args: [intereses[0], intereses[1], intereses[2], req.session.userId],
        });

        res.json({ success: true, message: "✅ Intereses actualizados correctamente" });
    } catch (err) {
        console.error("❌ Error al actualizar intereses:", err);
        res.status(500).json({ success: false, message: "Error al actualizar intereses" });
    }
});

// Guardar curso
app.post("/api/cursos/guardar", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const { name, plataforma, url, estado } = req.body;

    if (!name || !plataforma || !url) {
        return res.status(400).json({ success: false, message: "Faltan datos del curso" });
    }

    const sql = `
        INSERT INTO Courses (user_id, name, plataforma, url, estado)
        VALUES (?, ?, ?, ?, ?)
    `;

    try {
        console.log("📌 Datos que se van a insertar:", {
            user_id: req.session.userId,
            name,
            plataforma,
            url,
            estado: estado || "guardado"
        });

        await client.execute({
            sql,
            args: [req.session.userId, name, plataforma, url, estado || "guardado"],
        });

        res.json({ success: true, message: "✅ Curso guardado correctamente" });
    } catch (err) {
        console.error("❌ Error al guardar curso:", err);
        res.status(500).json({ success: false, message: "Error al guardar el curso" });
    }
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

app.post("/api/cursos/finalizar", async (req, res) => {
    const { url } = req.body;

    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
    }

    try {
        await client.execute({
            sql: "UPDATE Courses SET estado = 'finalizado' WHERE user_id = ? AND url = ?",
            args: [req.session.userId, url],
        });

        res.json({ success: true, message: "✅ Curso marcado como finalizado" });
    } catch (err) {
        console.error("❌ Error al finalizar curso:", err);
        res.status(500).json({ success: false, message: "Error al finalizar curso" });
    }
});

// Cerrar sesión
app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: "✅ Sesión cerrada" });
});

app.post("/filtrar-cursos", async (req, res) => {
    const { precio, idioma, q } = req.body;
    const apiKey = "c07d09b526dc02fe814b600d8740ba845dd7834ae6dd99e51ffbad05704fbc5d";
  
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
    const apiKey = "c07d09b526dc02fe814b600d8740ba845dd7834ae6dd99e51ffbad05704fbc5d";

    if (!query) {
        return res.status(400).json({ error: "Falta parámetro de búsqueda" });
    }

    const consultaFinal = `"curso" online sobre ${query}`;
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
app.get("/api/foro/mensajes", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });

    const query = `
        SELECT Foro.mensaje, Foro.fecha, Users.user, Foro.user_id
        FROM Foro
        JOIN Users ON Foro.user_id = Users.id
        ORDER BY Foro.fecha ASC
    `;

    try {
        const result = await client.execute(query);
        const mensajes = result.rows.map(m => ({
            mensaje: m.mensaje,
            fecha: m.fecha,
            user: m.user,
            propietario: m.user_id === req.session.userId
        }));

        res.json({ success: true, mensajes });
    } catch (err) {
        console.error("❌ Error al obtener mensajes del foro:", err);
        res.status(500).json({ success: false });
    }
});

// Enviar mensaje al foro
app.post("/api/foro/mensajes", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });

    const { mensaje } = req.body;
    if (!mensaje || mensaje.trim() === "") return res.status(400).json({ success: false });

    const query = "INSERT INTO Foro (user_id, mensaje) VALUES (?, ?)";

    try {
        await client.execute({
            sql: query,
            args: [req.session.userId, mensaje]
        });

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error al guardar mensaje en foro:", err);
        res.status(500).json({ success: false });
    }
});

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: "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" // tu clave
});

app.get("/api/recomendaciones", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "No autenticado" });
    }
  
    try {
      const result = await client.execute({
        sql: "SELECT interest1, interest2, interest3 FROM Users WHERE id = ?",
        args: [req.session.userId]
      });
  
      if (result.rows.length === 0) {
        return res.status(500).json({ success: false, message: "Error al obtener intereses" });
      }
  
      const intereses = result.rows[0];
      const mapa = {
        1: "Administración", 2: "Economía", 3: "Tecnología", 4: "Fotografía",
        5: "Cocina", 6: "Jardinería", 7: "Publicidad", 8: "Diseño Gráfico",
        9: "Programación", 10: "Idiomas", 11: "Emprendimiento", 12: "Marketing"
      };
  
      const temas = [mapa[intereses.interest1], mapa[intereses.interest2], mapa[intereses.interest3]].join(", ");
      const serpApiKey = "9624900be173d3dee2abd9eced069cce858eb6bc0733af0d73619fe7767c7399";
      const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent("curso online sobre " + temas)}&engine=google&api_key=${serpApiKey}`;
  
      const serpRes = await axios.get(serpUrl);
      const resultados = serpRes.data.organic_results?.slice(0, 8) || [];
  
      const systemPrompt = `Eres un asistente que analiza cursos educativos encontrados en internet. Tu tarea es: 
  1. Organizar los cursos por relevancia.
  2. Reescribir las descripciones de forma atractiva.
  3. Asignar una calificación del 1 al 5 según popularidad.
  4. Si es necesaria en el mercado laboral, añade esto a la descripción: "DEMANDA EN LA ACTUALIDAD".
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
      console.log("🔍 Respuesta cruda de ChatGPT:", texto);
  
      const cursosGPT = JSON.parse(texto);
      res.json({ success: true, cursos: cursosGPT });
  
    } catch (error) {
      console.error("❌ Error en recomendación:", error.message);
      res.status(500).json({ success: false, message: "Error al obtener recomendaciones" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { usuario, nuevaPassword } = req.body;
  
    if (!usuario || !nuevaPassword) {
      return res.status(400).json({ success: false, message: "Faltan datos" });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
  
      const result = await client.execute({
        sql: "UPDATE Users SET password = ? WHERE user = ?",
        args: [hashedPassword, usuario]
      });
  
      if (result.rowsAffected === 0) {
        return res.json({ success: false, message: "Usuario no encontrado" });
      }
  
      res.json({ success: true });
    } catch (err) {
      console.error("❌ Error en el servidor:", err);
      res.status(500).json({ success: false, message: "Error interno" });
    }
  });
  


// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
