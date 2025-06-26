const assert = require('node:assert');
const { test, after, beforeEach, describe } = require('node:test');
const mongoose = require('mongoose');
const supertest = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const helper = require('./test_helper');
const Note = require('../models/note');
const User = require('../models/user');

const api = supertest(app);

describe('when there is initially some notes saved for one user', () => {
	beforeEach(async () => {
		await User.deleteMany({});

		const passwordHash = await bcrypt.hash('sekret', 10);
		const user = new User({ username: 'root', passwordHash });

		const response = await user.save();

		const notesWithUserId = helper.initialNotes.map((note) => ({
			...note,
			user: response._id,
		}));

		await Note.deleteMany({});
		const notesResponse = await Note.insertMany(notesWithUserId);
		user.notes = notesResponse;

		await user.save();
	});

	test('notes are returned as json', async () => {
		await api
			.get('/api/notes')
			.expect(200)
			.expect('Content-Type', /application\/json/);
	});

	test('all notes are returned', async () => {
		const response = await api.get('/api/notes');

		assert.strictEqual(response.body.length, helper.initialNotes.length);
	});

	test('a specific note is within the returned notes', async () => {
		const response = await api.get('/api/notes');

		const contents = response.body.map((e) => e.content);
		assert(contents.includes('HTML is easy'));
	});

	describe('viewing a specific note', () => {
		test('succeeds with a valid id', async () => {
			const notesAtStart = await helper.notesInDb();
			const noteToView = notesAtStart[0];
			const resultNote = await api
				.get(`/api/notes/${noteToView.id}`)
				.expect(200)
				.expect('Content-Type', /application\/json/);

			assert.deepStrictEqual(resultNote.body, noteToView);
		});

		test('fails with statuscode 404 if note does not exist', async () => {
			const validNonexistingId = await helper.nonExistingId();

			await api.get(`/api/notes/${validNonexistingId}`).expect(404);
		});

		describe('viewing a specific user', () => {
			test('user has valid notes id', async () => {
				const users = await helper.usersInDb();
				const rootUser = users[0];

				const notes = await helper.notesInDb();
				const userNotesId = notes
					.filter((note) => note.user === rootUser.id)
					.map((note) => note.id);
				assert.deepStrictEqual(rootUser.notes, userNotesId);
			});
		});

		test('fails with statuscode 400 id is invalid', async () => {
			const invalidId = '5a3d5da59070081a82a3445';

			await api.get(`/api/notes/${invalidId}`).expect(400);
		});
	});

	describe('addition of a new note', () => {
		test('succeeds with valid data', async () => {
			const userDb = await helper.usersInDb();
			const userId = userDb[0].id;

			const newNote = {
				content: 'async/await simplifies making async calls',
				important: true,
				userId,
			};

			await api
				.post('/api/notes')
				.send(newNote)
				.expect(201)
				.expect('Content-Type', /application\/json/);

			const notesAtEnd = await helper.notesInDb();
			assert.strictEqual(notesAtEnd.length, helper.initialNotes.length + 1);

			const contents = notesAtEnd.map((n) => n.content);
			assert(contents.includes('async/await simplifies making async calls'));
		});

		test('fails with status code 400 if data invalid', async () => {
			const newNote = { important: true };

			await api.post('/api/notes').send(newNote).expect(400);

			const notesAtEnd = await helper.notesInDb();

			assert.strictEqual(notesAtEnd.length, helper.initialNotes.length);
		});
	});

	describe('deletion of a note', () => {
		test('succeeds with status code 204 if id is valid', async () => {
			const notesAtStart = await helper.notesInDb();
			const noteToDelete = notesAtStart[0];

			await api.delete(`/api/notes/${noteToDelete.id}`).expect(204);

			const notesAtEnd = await helper.notesInDb();

			const contents = notesAtEnd.map((n) => n.content);
			assert(!contents.includes(noteToDelete.content));

			assert.strictEqual(notesAtEnd.length, helper.initialNotes.length - 1);
		});
	});
});

describe('when there is initially one user in db', () => {
	beforeEach(async () => {
		await User.deleteMany({});

		const passwordHash = await bcrypt.hash('sekret', 10);
		const user = new User({ username: 'root', passwordHash });

		await user.save();
	});

	test('creation succeeds with a fresh username', async () => {
		const usersAtStart = await helper.usersInDb();

		const newUser = {
			username: 'mluukkai',
			name: 'Matti Luukkainen',
			password: 'salainen',
		};

		await api
			.post('/api/users')
			.send(newUser)
			.expect(201)
			.expect('Content-Type', /application\/json/);

		const usersAtEnd = await helper.usersInDb();
		assert.strictEqual(usersAtEnd.length, usersAtStart.length + 1);

		const usernames = usersAtEnd.map((u) => u.username);
		assert(usernames.includes(newUser.username));
	});

	test('creation fails with proper statuscode and message if username is already taken', async () => {
		const usersAtStart = await helper.usersInDb();

		const newUser = {
			username: 'root',
			name: 'SuperUser',
			password: 'salainen',
		};

		const result = await api
			.post('/api/users')
			.send(newUser)
			.expect(400)
			.expect('Content-Type', /application\/json/);

		const usersAtEnd = await helper.usersInDb();
		assert(result.body.error.includes('expected `username` to be unique'));

		assert.strictEqual(usersAtStart.length, usersAtEnd.length);
	});
});

after(async () => {
	await mongoose.connection.close();
});
