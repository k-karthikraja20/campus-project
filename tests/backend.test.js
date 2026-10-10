import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/server";
import { connectDB, disconnectDB } from "../src/config/db";
import User from "../src/models/User";
import Vote from "../src/models/Vote";

const TEST_DB_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/campus_election_test";

let adminToken = "";
let supervisorToken = "";
let studentToken = "";
let lowScoreStudentToken = "";

let testElectionId = "";
let testChairmanPositionId = "";
let testSecretaryPositionId = "";
let testCandidateUserId = "";
let testCandidateProfileId = "";

beforeAll(async () => {
  await connectDB(TEST_DB_URI);
  // Clear test DB
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
  await disconnectDB();
});

describe("1. Authentication & Role Authorization", () => {
  it("should register a new student with academic percentage", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test Student High",
        email: "test_student@campus.edu",
        password: "Password@123",
        regNo: "TST001",
        department: "BCA",
        year: "3rd Year",
        phone: "+91 9999900001",
        academicPercentage: 95,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("student");
    expect(res.body.user.academicPercentage).toBe(95);
    studentToken = res.body.token;
  });

  it("should reject student registration with duplicate email or regNo", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Duplicate Student",
        email: "test_student@campus.edu",
        password: "Password@123",
        regNo: "TST001",
        department: "BCA",
        year: "3rd Year",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should register a low-scoring student for eligibility tests", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Low Score Student",
        email: "lowscore@campus.edu",
        password: "Password@123",
        regNo: "TST002",
        department: "BBA",
        year: "1st Year",
        academicPercentage: 62,
      });

    expect(res.status).toBe(201);
    lowScoreStudentToken = res.body.token;
  });

  it("should log in and get JWT token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test_student@campus.edu",
        password: "Password@123",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it("should create admin and supervisor users for role tests", async () => {
    // Create Admin directly in test DB
    const adminUser = await User.create({
      name: "Admin User",
      email: "admin_test@campus.edu",
      password: "Admin@Password123",
      role: "admin",
      department: "Administration",
    });

    const supUser = await User.create({
      name: "Supervisor User",
      email: "sup_test@campus.edu",
      password: "Sup@Password123",
      role: "supervisor",
      department: "Faculty",
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin_test@campus.edu", password: "Admin@Password123" });
    adminToken = adminLogin.body.token;

    const supLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "sup_test@campus.edu", password: "Sup@Password123" });
    supervisorToken = supLogin.body.token;

    expect(adminToken).toBeDefined();
    expect(supervisorToken).toBeDefined();
  });

  it("should block non-admin from admin dashboard", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it("should allow admin to view dashboard statistics", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalStudents).toBeGreaterThanOrEqual(1);
  });
});

describe("2. Election & Position CRUD with Eligibility Thresholds", () => {
  it("should allow admin to create an election", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const res = await request(app)
      .post("/api/elections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Test Campus Election 2026",
        description: "Testing election flow",
        startDate: tomorrow,
        endDate: nextWeek,
        status: "draft",
        isSelfVotingAllowed: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Test Campus Election 2026");
    testElectionId = res.body.data._id;
  });

  it("should allow admin to add Chairman position (threshold 90%) and Secretary (threshold 70%)", async () => {
    const pos1 = await request(app)
      .post(`/api/elections/${testElectionId}/positions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Chairman",
        description: "Requires 90% academic score",
        minAcademicPercentage: 90,
      });

    expect(pos1.status).toBe(201);
    testChairmanPositionId = pos1.body.data._id;

    const pos2 = await request(app)
      .post(`/api/elections/${testElectionId}/positions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Secretary",
        description: "Requires 70% academic score",
        minAcademicPercentage: 70,
      });

    expect(pos2.status).toBe(201);
    testSecretaryPositionId = pos2.body.data._id;
  });

  it("should fetch active elections with populated positions via GET /api/elections/active", async () => {
    // First activate testElection
    await request(app)
      .patch(`/api/elections/${testElectionId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "active" });

    const res = await request(app).get("/api/elections/active");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((e) => e._id.toString() === testElectionId.toString());
    expect(found).toBeDefined();
    expect(found.title).toBe("Test Campus Election 2026");
    expect(found.status).toBe("active");
    expect(found.positions.length).toBeGreaterThanOrEqual(2);
    expect(found.positions.some((p) => p.title === "Chairman")).toBe(true);
    expect(found.positions.some((p) => p.title === "Secretary")).toBe(true);

    // Restore to draft so test 4 expectations hold
    await request(app)
      .patch(`/api/elections/${testElectionId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "draft" });
  });
});

describe("3. Candidate Nomination, Server-Side Eligibility & Symbol Uniqueness", () => {
  it("should REJECT candidate nomination if student percentage is below position threshold", async () => {
    // Low score student (62%) applies for Chairman (requires 90%)
    const res = await request(app)
      .post("/api/candidate-applications")
      .set("Authorization", `Bearer ${lowScoreStudentToken}`)
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        manifesto: "I want to lead",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Eligibility check failed");
  });

  it("should ACCEPT candidate nomination if student percentage satisfies position threshold", async () => {
    // High score student (95%) applies for Chairman (requires 90%)
    const res = await request(app)
      .post("/api/candidate-applications")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        manifesto: "High tech campus and open labs",
        plannedWork: ["24/7 Library", "Coding Clubs"],
        preferredSymbol: "Book",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
  });

  it("should allow supervisor to approve nomination and assign a unique symbol", async () => {
    // Get application
    const appList = await request(app)
      .get("/api/candidate-applications")
      .set("Authorization", `Bearer ${supervisorToken}`);

    const appItem = appList.body.data[0];
    expect(appItem).toBeDefined();

    const reviewRes = await request(app)
      .put(`/api/candidate-applications/${appItem._id}/review`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        status: "approved",
        reviewComment: "Verified eligibility (95% >= 90%). Approved.",
        assignedSymbol: {
          name: "Book",
          code: "BOOK",
          icon: "📖",
        },
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe("approved");

    // Check candidate profile was created
    const candidatesRes = await request(app).get(`/api/candidates?electionId=${testElectionId}`);
    expect(candidatesRes.status).toBe(200);
    expect(candidatesRes.body.data.length).toBe(1);
    expect(candidatesRes.body.data[0].assignedSymbol.code).toBe("BOOK");

    testCandidateUserId = candidatesRes.body.data[0].candidateId._id;
    testCandidateProfileId = candidatesRes.body.data[0]._id;
  });

  it("should REJECT assigning a duplicate symbol for the same election and position", async () => {
    // Create another eligible candidate directly
    const cand2 = await User.create({
      name: "Second Eligible Student",
      email: "cand2@campus.edu",
      password: "Password@123",
      role: "student",
      regNo: "TST003",
      department: "BCA",
      year: "3rd Year",
      academicPercentage: 92,
    });

    const appRes = await request(app)
      .post("/api/candidate-applications")
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        candidateId: cand2._id,
        manifesto: "Second candidate manifesto",
      })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(appRes.status).toBe(201);

    // Try approving with the SAME symbol "Book" (code: BOOK)
    const reviewRes = await request(app)
      .put(`/api/candidate-applications/${appRes.body.data._id}/review`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        status: "approved",
        assignedSymbol: {
          name: "Book",
          code: "BOOK",
          icon: "📖",
        },
      });

    expect(reviewRes.status).toBe(400);
    expect(reviewRes.body.message).toContain("already assigned");
  });
});

describe("4. Voting, Secret Ballot, Duplicate Prevention & Results", () => {
  it("should reject voting when election is not ACTIVE", async () => {
    const voteRes = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${lowScoreStudentToken}`)
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        candidateId: testCandidateUserId,
      });

    expect(voteRes.status).toBe(400);
    expect(voteRes.body.message).toContain("not currently active");
  });

  it("should activate election and enable voting within valid date window", async () => {
    // Set election start date to past and end date to future
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await request(app)
      .put(`/api/elections/${testElectionId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        startDate: yesterday,
        endDate: nextWeek,
        status: "active",
      });

    const res = await request(app).get(`/api/elections/${testElectionId}`);
    expect(res.body.data.status).toBe("active");
  });

  it("should allow an eligible student to cast a ballot and return a personal receipt", async () => {
    const voteRes = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${lowScoreStudentToken}`)
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        candidateId: testCandidateUserId,
      });

    expect(voteRes.status).toBe(201);
    expect(voteRes.body.success).toBe(true);
    expect(voteRes.body.receipt).toBeDefined();
    expect(voteRes.body.receipt.receiptId).toMatch(/^RCPT-/);
  });

  it("should strictly PREVENT duplicate voting for the same position by the same student", async () => {
    const duplicateRes = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${lowScoreStudentToken}`)
      .send({
        electionId: testElectionId,
        positionId: testChairmanPositionId,
        candidateId: testCandidateUserId,
      });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.message).toContain("already cast your vote");
  });

  it("should enforce secret ballot: Vote document contains NO student ID", async () => {
    const voteInDb = await Vote.findOne({
      electionId: testElectionId,
      positionId: testChairmanPositionId,
    }).lean();

    expect(voteInDb).toBeDefined();
    expect(voteInDb.candidateId.toString()).toBe(testCandidateUserId.toString());
    expect(voteInDb.studentId).toBeUndefined();
    expect(voteInDb.voterId).toBeUndefined();
  });

  it("should allow student to fetch personal receipts without exposing choice in public audit", async () => {
    const res = await request(app)
      .get("/api/votes/my-receipts")
      .set("Authorization", `Bearer ${lowScoreStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].receiptId).toBeDefined();
  });

  it("should prevent public/student from viewing results while election is not published", async () => {
    const res = await request(app)
      .get(`/api/results/${testElectionId}`)
      .set("Authorization", `Bearer ${lowScoreStudentToken}`);

    expect(res.status).toBe(403);
  });

  it("should allow admin & supervisor to view results before publishing", async () => {
    const res = await request(app)
      .get(`/api/results/${testElectionId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.positions[0].totalVotes).toBe(1);
    expect(res.body.data.positions[0].winner.name).toBe("Test Student High");
  });

  it("should allow all users to view results once admin publishes them", async () => {
    // Publish results
    const pubRes = await request(app)
      .post(`/api/elections/${testElectionId}/publish-results`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(pubRes.status).toBe(200);

    // Student can now view results
    const res = await request(app)
      .get(`/api/results/${testElectionId}`)
      .set("Authorization", `Bearer ${lowScoreStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.election.isResultsPublished).toBe(true);
    expect(res.body.data.positions[0].winner).toBeDefined();
    expect(res.body.data.positions[0].winner.votes).toBe(1);
  });
});

describe("5. Complete Candidate Approval Workflow & Positions API", () => {
  let approvalElectionId = "";
  let approvalPositionId = "";
  let applicantUserToken = "";
  let applicantUserId = "";
  let pendingCandidateId = "";
  let voterStudentToken = "";

  beforeAll(async () => {
    // 1. Create a fresh election
    const elRes = await request(app)
      .post("/api/elections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Student Council Election 2026",
        description: "Testing candidate approval workflow",
        startDate: new Date(Date.now() - 3600000), // active
        endDate: new Date(Date.now() + 86400000),
        status: "active",
        isSelfVotingAllowed: false,
      });
    approvalElectionId = elRes.body.data._id;

    // 2. Add position
    const posRes = await request(app)
      .post(`/api/elections/${approvalElectionId}/positions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "President",
        description: "Student Council President",
        minAcademicPercentage: 75,
        order: 1,
      });
    approvalPositionId = posRes.body.data._id;

    // 3. Register applicant student
    const studentRes = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Ananya Sharma",
        email: "ananya@campus.edu",
        password: "Password@123",
        regNo: "REG2026999",
        department: "Computer Science",
        year: "3rd Year",
        academicPercentage: 88,
      });
    applicantUserToken = studentRes.body.token;
    applicantUserId = studentRes.body.user.id || studentRes.body.user._id;

    // 4. Register voter student
    const voterRes = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Voter Student",
        email: "voter@campus.edu",
        password: "Password@123",
        regNo: "REG2026888",
        department: "Mechanical",
        year: "2nd Year",
        academicPercentage: 80,
      });
    voterStudentToken = voterRes.body.token;
  });

  it("should fetch positions for election via GET /api/elections/:electionId/positions", async () => {
    const res = await request(app).get(`/api/elections/${approvalElectionId}/positions`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data[0].title).toBe("President");
    expect(res.body.data[0].electionId.toString()).toBe(approvalElectionId.toString());
  });

  it("should submit candidate nomination and save candidate with approvalStatus: 'pending'", async () => {
    const applyRes = await request(app)
      .post("/api/candidates")
      .set("Authorization", `Bearer ${applicantUserToken}`)
      .send({
        electionId: approvalElectionId,
        positionId: approvalPositionId,
        manifesto: "Empowering every student with technology and modern facilities.",
        plannedWork: ["Smart Classrooms", "Tech Fests"],
        preferredSymbol: "Lamp",
      });

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.success).toBe(true);
    expect(applyRes.body.data.approvalStatus).toBe("pending");
    expect(applyRes.body.data.isApproved).toBe(false);
    pendingCandidateId = applyRes.body.data._id;
  });

  it("should NOT return pending candidate in public/student API: GET /api/candidates?electionId=...", async () => {
    const res = await request(app).get(`/api/candidates?electionId=${approvalElectionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(0);
    expect(res.body.data.length).toBe(0);
  });

  it("should block non-admin from GET /api/candidates/pending", async () => {
    const res = await request(app)
      .get("/api/candidates/pending")
      .set("Authorization", `Bearer ${voterStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("should allow admin to view pending candidate via GET /api/candidates/pending", async () => {
    const res = await request(app)
      .get("/api/candidates/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const found = res.body.data.find((c) => c._id === pendingCandidateId);
    expect(found).toBeDefined();
    expect(found.approvalStatus).toBe("pending");
    expect(found.studentId.name).toBe("Ananya Sharma");
    expect(found.positionId.title).toBe("President");
  });

  it("should strictly REJECT voting for a pending candidate", async () => {
    const res = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${voterStudentToken}`)
      .send({
        electionId: approvalElectionId,
        positionId: approvalPositionId,
        candidateId: pendingCandidateId,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("not approved");
  });

  it("should block non-admin from approving candidates", async () => {
    const res = await request(app)
      .put(`/api/candidates/${pendingCandidateId}/approve`)
      .set("Authorization", `Bearer ${voterStudentToken}`)
      .send({
        assignedSymbol: { name: "Lamp", code: "LAMP", icon: "🪔" },
      });
    expect(res.status).toBe(403);
  });

  it("should allow admin to approve candidate via PUT /api/candidates/:id/approve", async () => {
    const res = await request(app)
      .put(`/api/candidates/${pendingCandidateId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        assignedSymbol: { name: "Lamp", code: "LAMP", icon: "🪔" },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Candidate approved successfully");
    expect(res.body.data.approvalStatus).toBe("approved");
    expect(res.body.data.isApproved).toBe(true);
  });

  it("should return error 400 when attempting to approve already approved candidate", async () => {
    const res = await request(app)
      .put(`/api/candidates/${pendingCandidateId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("already approved");
  });

  it("should now return approved candidate in GET /api/candidates?electionId=... with populated fields", async () => {
    const res = await request(app).get(`/api/candidates?electionId=${approvalElectionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data.length).toBe(1);

    const cand = res.body.data[0];
    expect(cand._id).toBe(pendingCandidateId);
    expect(cand.approvalStatus).toBe("approved");

    // Verify populated student information (matches React component expectation: const student = cand.studentId || {})
    expect(cand.studentId).toBeDefined();
    expect(cand.studentId.name).toBe("Ananya Sharma");
    expect(cand.studentId.regNo).toBe("REG2026999");
    expect(cand.studentId.department).toBe("Computer Science");
    expect(cand.studentId.year).toBe("3rd Year");
    expect(cand.studentId.academicPercentage).toBe(88);

    // Verify position information (matches pos = cand.positionId || {})
    expect(cand.positionId).toBeDefined();
    expect(cand.positionId.title).toBe("President");

    // Verify symbol information (matches symbol = cand.assignedSymbol || {})
    expect(cand.assignedSymbol).toBeDefined();
    expect(cand.assignedSymbol.name).toBe("Lamp");
    expect(cand.assignedSymbol.icon).toBe("🪔");

    // Verify manifesto and planned work
    expect(cand.manifesto).toBe("Empowering every student with technology and modern facilities.");
    expect(cand.plannedWork).toEqual(["Smart Classrooms", "Tech Fests"]);
  });

  it("should allow student to cast vote for the approved candidate", async () => {
    const res = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${voterStudentToken}`)
      .send({
        electionId: approvalElectionId,
        positionId: approvalPositionId,
        candidateId: pendingCandidateId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.receipt).toBeDefined();
    expect(res.body.receipt.receiptId).toMatch(/^RCPT-/);
  });

  it("should reject candidate via PUT /api/candidates/:id/reject and prevent voting", async () => {
    // 1. Create second candidate
    const student2Res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Second Candidate",
        email: "second@campus.edu",
        password: "Password@123",
        regNo: "REG2026777",
        department: "IT",
        year: "3rd Year",
        academicPercentage: 82,
      });

    const applyRes = await request(app)
      .post("/api/candidates")
      .set("Authorization", `Bearer ${student2Res.body.token}`)
      .send({
        electionId: approvalElectionId,
        positionId: approvalPositionId,
        manifesto: "Second candidate manifesto",
      });

    const secondCandId = applyRes.body.data._id;

    // 2. Reject candidate
    const rejectRes = await request(app)
      .put(`/api/candidates/${secondCandId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reviewComment: "Incomplete manifesto" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);
    expect(rejectRes.body.message).toBe("Candidate rejected successfully");
    expect(rejectRes.body.data.approvalStatus).toBe("rejected");

    // 3. Rejected candidate does not appear in candidate list
    const candList = await request(app).get(`/api/candidates?electionId=${approvalElectionId}`);
    expect(candList.body.data.some((c) => c._id === secondCandId)).toBe(false);

    // 4. Cannot vote for rejected candidate
    const voteRes = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${applicantUserToken}`)
      .send({
        electionId: approvalElectionId,
        positionId: approvalPositionId,
        candidateId: secondCandId,
      });

    expect(voteRes.status).toBe(400);
    expect(voteRes.body.message).toContain("not approved");
  });
});

describe("6. Complete Two-Level Candidate Approval & Result Publishing Flow", () => {
  let flowElectionId = "";
  let flowPositionId = "";
  let candidateStudentToken = "";
  let candidateStudentId = "";
  let flowCandidateId = "";
  let secondFlowStudentToken = "";
  let secondFlowCandidateId = "";

  it("should setup a new election and position for the complete flow", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const elRes = await request(app)
      .post("/api/elections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Council Election 2026",
        description: "Testing two-level approval",
        startDate: tomorrow,
        endDate: nextWeek,
        status: "active",
      });

    expect(elRes.status).toBe(201);
    flowElectionId = elRes.body.data._id;

    const posRes = await request(app)
      .post(`/api/elections/${flowElectionId}/positions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Vice President",
        description: "Campus VP position",
        minAcademicPercentage: 75,
      });

    expect(posRes.status).toBe(201);
    flowPositionId = posRes.body.data._id;
  });

  it("should register eligible student and submit candidate application with pending two-level status", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Vikram Malhotra",
        email: "vikram@campus.edu",
        password: "Password@123",
        regNo: "REG2026333",
        department: "Mechanical Engineering",
        year: "3rd Year",
        academicPercentage: 86,
      });

    expect(regRes.status).toBe(201);
    candidateStudentToken = regRes.body.token;
    candidateStudentId = regRes.body.user._id;

    const applyRes = await request(app)
      .post("/api/candidates")
      .set("Authorization", `Bearer ${candidateStudentToken}`)
      .send({
        electionId: flowElectionId,
        positionId: flowPositionId,
        manifesto: "Technical clubs and laboratory expansion.",
        plannedWork: ["Lab upgrades", "Industry hackathons"],
        preferredSymbol: "Torch",
      });

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.data.approvalStatus).toBe("pending");
    expect(applyRes.body.data.adminApproval.status).toBe("pending");
    expect(applyRes.body.data.supervisorApproval.status).toBe("pending");
    expect(applyRes.body.data.isApproved).toBe(false);
    flowCandidateId = applyRes.body.data._id;
  });

  it("should allow candidate to retrieve application status via GET /api/candidates/status and enforce 403 on unapproved dashboard", async () => {
    // Check status endpoint returns 200 with pending dual approval
    const statusRes = await request(app)
      .get("/api/candidates/status")
      .set("Authorization", `Bearer ${candidateStudentToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.hasApplication).toBe(true);
    expect(statusRes.body.approvalStatus).toBe("pending");
    expect(statusRes.body.adminApproval.status).toBe("pending");
    expect(statusRes.body.supervisorApproval.status).toBe("pending");

    // Check candidate dashboard GET /api/candidates/me enforces 403 when not approved
    const meRes = await request(app)
      .get("/api/candidates/me")
      .set("Authorization", `Bearer ${candidateStudentToken}`);

    expect(meRes.status).toBe(403);
    expect(meRes.body.message).toContain("restricted to approved candidates");
  });

  it("should keep candidate pending when ONLY Admin approves", async () => {
    // Admin approves candidate
    const adminApproveRes = await request(app)
      .put(`/api/candidates/${flowCandidateId}/admin-approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        assignedSymbol: { name: "Torch", code: "TORCH", icon: "🔥" },
      });

    expect(adminApproveRes.status).toBe(200);
    expect(adminApproveRes.body.data.adminApproval.status).toBe("approved");
    expect(adminApproveRes.body.data.supervisorApproval.status).toBe("pending");
    expect(adminApproveRes.body.data.approvalStatus).toBe("pending");
    expect(adminApproveRes.body.data.isApproved).toBe(false);

    // Public list should still NOT show candidate
    const publicList = await request(app).get(`/api/candidates?electionId=${flowElectionId}`);
    expect(publicList.body.data.some((c) => c._id === flowCandidateId)).toBe(false);
  });

  it("should make candidate APPROVED once Supervisor ALSO approves", async () => {
    // Supervisor approves candidate
    const supApproveRes = await request(app)
      .put(`/api/candidates/${flowCandidateId}/supervisor-approve`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});

    expect(supApproveRes.status).toBe(200);
    expect(supApproveRes.body.data.adminApproval.status).toBe("approved");
    expect(supApproveRes.body.data.supervisorApproval.status).toBe("approved");
    expect(supApproveRes.body.data.approvalStatus).toBe("approved");
    expect(supApproveRes.body.data.isApproved).toBe(true);

    // Now candidate appears on public directory
    const publicList = await request(app).get(`/api/candidates?electionId=${flowElectionId}`);
    expect(publicList.body.data.some((c) => c._id === flowCandidateId)).toBe(true);

    // Candidate dashboard GET /api/candidates/me now succeeds with 200
    const meApprovedRes = await request(app)
      .get("/api/candidates/me")
      .set("Authorization", `Bearer ${candidateStudentToken}`);

    expect(meApprovedRes.status).toBe(200);
    expect(meApprovedRes.body.data.approvalStatus).toBe("approved");
  });

  it("should prevent duplicate application for the same student + election + position", async () => {
    const dupRes = await request(app)
      .post("/api/candidates")
      .set("Authorization", `Bearer ${candidateStudentToken}`)
      .send({
        electionId: flowElectionId,
        positionId: flowPositionId,
        manifesto: "Duplicate application attempt",
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.message).toBe("You have already submitted an eligibility application for this position.");
  });

  it("should set candidate status to REJECTED when Supervisor rejects", async () => {
    const reg2Res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Pooja Reddy",
        email: "pooja@campus.edu",
        password: "Password@123",
        regNo: "REG2026444",
        department: "Civil Engineering",
        year: "3rd Year",
        academicPercentage: 80,
      });

    secondFlowStudentToken = reg2Res.body.token;

    const applyRes = await request(app)
      .post("/api/candidates")
      .set("Authorization", `Bearer ${secondFlowStudentToken}`)
      .send({
        electionId: flowElectionId,
        positionId: flowPositionId,
        manifesto: "Eco-friendly campus.",
      });

    secondFlowCandidateId = applyRes.body.data._id;

    // Supervisor rejects candidate
    const supRejectRes = await request(app)
      .put(`/api/candidates/${secondFlowCandidateId}/supervisor-reject`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ rejectionReason: "Insufficient manifesto specifics" });

    expect(supRejectRes.status).toBe(200);
    expect(supRejectRes.body.data.supervisorApproval.status).toBe("rejected");
    expect(supRejectRes.body.data.approvalStatus).toBe("rejected");
    expect(supRejectRes.body.data.rejectionReason).toBe("Insufficient manifesto specifics");
  });

  it("should allow students to cast vote for the approved candidate", async () => {
    const voteRes = await request(app)
      .post("/api/votes")
      .set("Authorization", `Bearer ${secondFlowStudentToken}`)
      .send({
        electionId: flowElectionId,
        positionId: flowPositionId,
        candidateId: flowCandidateId,
      });

    expect(voteRes.status).toBe(201);
    expect(voteRes.body.success).toBe(true);
  });

  it("should HIDE vote counts before Admin publishes results", async () => {
    // 1. Candidate checking own result: voteCount hidden
    const candResultRes = await request(app)
      .get(`/api/results/${flowElectionId}/candidate-result`)
      .set("Authorization", `Bearer ${candidateStudentToken}`);

    expect(candResultRes.status).toBe(200);
    expect(candResultRes.body.published).toBe(false);
    expect(candResultRes.body.data?.voteCount).toBeUndefined();

    // 2. Student checking results: not published
    const studentRes = await request(app)
      .get(`/api/results/${flowElectionId}`)
      .set("Authorization", `Bearer ${secondFlowStudentToken}`);

    expect(studentRes.body.published).toBe(false);
  });

  it("should allow Admin to preview results with vote counts before publishing", async () => {
    const previewRes = await request(app)
      .get(`/api/results/${flowElectionId}/preview`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.success).toBe(true);
    expect(previewRes.body.preview).toBe(true);
    expect(previewRes.body.data.positions[0].totalVotes).toBe(1);
    expect(previewRes.body.data.positions[0].candidates[0].votes).toBe(1);
  });

  it("should allow Admin to publish results via PUT /api/results/:electionId/publish", async () => {
    const publishRes = await request(app)
      .put(`/api/results/${flowElectionId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.published).toBe(true);
    expect(publishRes.body.data.election.resultPublished).toBe(true);
  });

  it("should now display candidate vote count and winner status after Admin publishes", async () => {
    // 1. Candidate result endpoint
    const candResultRes = await request(app)
      .get(`/api/results/${flowElectionId}/candidate-result`)
      .set("Authorization", `Bearer ${candidateStudentToken}`);

    expect(candResultRes.status).toBe(200);
    expect(candResultRes.body.published).toBe(true);
    expect(candResultRes.body.data.voteCount).toBe(1);
    expect(candResultRes.body.data.percentage).toBe(100);
    expect(candResultRes.body.data.winner).toBe(true);
    expect(candResultRes.body.data.resultStatus).toBe("WINNER");

    // 2. Student result endpoint
    const studentRes = await request(app)
      .get(`/api/results/${flowElectionId}`)
      .set("Authorization", `Bearer ${secondFlowStudentToken}`);

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.published).toBe(true);
    expect(studentRes.body.data.positions[0].candidates[0].votes).toBe(1);
    expect(studentRes.body.data.positions[0].winner.name).toBe("Vikram Malhotra");
  });
});


