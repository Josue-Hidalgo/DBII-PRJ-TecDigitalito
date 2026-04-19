const {
  sendCourseQuery,
  getCourseThreads,
  getThreadMessages,
  sendDirectMessage,
  getDirectMessages,
  getConversations,
} = require('../../logic/Messages');

// POST /api/messages/course  — HU-17 / HU-26
exports.sendCourseQuery = async (req, res) => {
  try {
    const { courseId, senderId, text, threadId } = req.body;
    if (!courseId || !senderId || !text) return res.status(400).json({ message: 'Faltan campos.' });

    const result = await sendCourseQuery({ courseId, senderId, text, threadId });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404
      : error.message.includes('matriculado') ? 403 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/messages/course/:courseId/threads  — HU-17
exports.getCourseThreads = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await getCourseThreads({ courseId, userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/messages/thread/:threadId  
exports.getThreadMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await getThreadMessages({ threadId, userId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404
      : error.message.includes('acceso') ? 403 : 500;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/messages/direct  — HU-30
exports.sendDirectMessage = async (req, res) => {
  try {
    const { senderId, recipientId, text } = req.body;
    if (!senderId || !recipientId || !text) return res.status(400).json({ message: 'Faltan campos.' });

    const result = await sendDirectMessage({ senderId, recipientId, text });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/messages/direct/:userId/:otherUserId  — HU-30
exports.getDirectMessages = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const result = await getDirectMessages({ userId, otherUserId, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/messages/conversations/:userId  — HU-30
exports.getConversations = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getConversations({ userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};