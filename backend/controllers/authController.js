const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const userModel = require('../models/userModel');
const { isEmail, assertRequired } = require('../utils/validators');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

const register = asyncHandler(async (req, res) => {
  assertRequired(['name', 'email', 'password'], req.body);

  const { name, email, password } = req.body;

  if (!isEmail(email)) {
    throw new HttpError(400, 'Invalid email format');
  }

  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }

  const existing = await userModel.getUserByEmail(email);
  if (existing) {
    throw new HttpError(409, 'Email already in use');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await userModel.createUser({ name: name.trim(), email: email.toLowerCase(), passwordHash });
  const user = await userModel.getUserById(created.id);

  const token = signToken(user);
  res.status(201).json({ token, user });
});

const login = asyncHandler(async (req, res) => {
  assertRequired(['email', 'password'], req.body);

  const { email, password } = req.body;
  const user = await userModel.getUserByEmail(email.toLowerCase());

  if (!user) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const token = signToken(user);
  const safeUser = await userModel.getUserById(user.id);

  res.json({ token, user: safeUser });
});

module.exports = {
  register,
  login
};
