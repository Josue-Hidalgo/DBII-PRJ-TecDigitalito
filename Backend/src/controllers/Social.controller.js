const {
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  getFriends,
  getFriendCourses,
  getCoursemates,
} = require('../../logic/Social');

// ── GET /api/social/users/search?q=término  (HU-29) ──────────────────────────
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(400).json({ message: 'Parámetro de búsqueda q requerido.' });
    }
    const result = await searchUsers({ query: q.trim() });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/social/friends/request  (HU-28) ────────────────────────────────
exports.sendFriendRequest = async (req, res) => {
  try {
    const { requesterId, targetId } = req.body;
    if (!requesterId || !targetId) {
      return res.status(400).json({ message: 'requesterId y targetId son requeridos.' });
    }
    const result = await sendFriendRequest({ requesterId, targetId });
    res.status(201).json(result);
  } catch (error) {
    const status =
      error.message.includes('ya existe') || error.message.includes('ya son amigos') ? 409
      : error.message.includes('no encontrado') ? 404
      : 500;
    res.status(status).json({ message: error.message });
  }
};

// ── PATCH /api/social/friends/request/:requesterId  (HU-28) ──────────────────
exports.respondFriendRequest = async (req, res) => {
  try {
    const { requesterId }    = req.params;
    const { userId, action } = req.body; // action: 'accept' | 'reject'

    if (!userId || !action) {
      return res.status(400).json({ message: 'userId y action (accept|reject) son requeridos.' });
    }
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'action debe ser "accept" o "reject".' });
    }

    const result = await respondFriendRequest({ requesterId, userId, action });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no encontrada') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// ── GET /api/social/friends/:userId  (HU-28) ─────────────────────────────────
exports.getFriends = async (req, res) => {
  try {
    const { userId } = req.params;
    const result     = await getFriends({ userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/social/friends/:userId/courses  (HU-28) ─────────────────────────
exports.getFriendCourses = async (req, res) => {
  try {
    const { userId }  = req.params;
    const { friendId } = req.query;
    if (!friendId) return res.status(400).json({ message: 'friendId requerido como query param.' });

    const result = await getFriendCourses({ userId, friendId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no son amigos') ? 403 : 500;
    res.status(status).json({ message: error.message });
  }
};

// ── GET /api/social/courses/:courseId/mates  (HU-27) ─────────────────────────
exports.getCoursemates = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId }   = req.query;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await getCoursemates({ courseId, userId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('matriculado') ? 403 : 500;
    res.status(status).json({ message: error.message });
  }
};
