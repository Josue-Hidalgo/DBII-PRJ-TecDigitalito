const express = require('express');
const router = express.Router();
const {
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  getFriends,
  getFriendCourses,
  getCoursemates,
} = require('../controllers/Social.controller');

// HU-29 — Buscar usuarios por nombre o username (?q=término)
router.get('/users/search', searchUsers);

// HU-28 — Enviar solicitud de amistad
router.post('/friends/request', sendFriendRequest);

// HU-28 — Aceptar o rechazar solicitud de amistad
router.patch('/friends/request/:requesterId', respondFriendRequest);

// HU-28 — Ver lista de amigos del usuario
router.get('/friends/:userId', getFriends);

// HU-28 — Ver cursos que un amigo ha llevado o imparte
router.get('/friends/:userId/courses', getFriendCourses);

// HU-27 — Ver compañeros matriculados en un curso
router.get('/courses/:courseId/mates', getCoursemates);

module.exports = router;
