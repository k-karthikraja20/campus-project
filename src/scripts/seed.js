require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const CandidateApplication = require("../models/CandidateApplication");
const CandidateProfile = require("../models/CandidateProfile");
const Vote = require("../models/Vote");
const VoteReceipt = require("../models/VoteReceipt");
const AuditLog = require("../models/AuditLog");
const { ROLES, ELECTION_STATUS, APPLICATION_STATUS, SUPPORTED_SYMBOLS } = require("../config/constants");

const seedDatabase = async () => {
  try {
    console.log("[Seed] Connecting to database...");
    await connectDB();

    console.log("[Seed] Clearing existing collections...");
    await User.deleteMany({});
    await Election.deleteMany({});
    await ElectionPosition.deleteMany({});
    await CandidateApplication.deleteMany({});
    await CandidateProfile.deleteMany({});
    await Vote.deleteMany({});
    await VoteReceipt.deleteMany({});
    await AuditLog.deleteMany({});

    console.log("[Seed] Creating Admin...");
    const admin = await User.create({
      name: process.env.ADMIN_NAME || "System Administrator",
      email: process.env.ADMIN_EMAIL || "admin@campus.edu",
      password: process.env.ADMIN_PASSWORD || "Admin@123",
      role: ROLES.ADMIN,
      department: "Administration",
      phone: "+91 9876543210",
      academicPercentage: 99,
    });

    console.log("[Seed] Creating Supervisor...");
    const supervisor = await User.create({
      name: "Prof. Rajesh Sharma",
      email: process.env.SUPERVISOR_EMAIL || "supervisor@campus.edu",
      password: process.env.SUPERVISOR_PASSWORD || "Supervisor@123",
      role: ROLES.SUPERVISOR,
      department: "Faculty of Computer Applications",
      phone: "+91 9876543211",
      academicPercentage: 95,
    });

    console.log("[Seed] Creating Students with varying academic scores...");
    const student1 = await User.create({
      name: "Karthik Raja",
      email: "karthik@campus.edu",
      password: "Student@123",
      role: ROLES.CANDIDATE,
      regNo: "BCA2026001",
      department: "BCA",
      year: "3rd Year",
      phone: "+91 9876500001",
      academicPercentage: 94,
    });

    const student2 = await User.create({
      name: "Rahul Verma",
      email: "rahul@campus.edu",
      password: "Student@123",
      role: ROLES.CANDIDATE,
      regNo: "BCA2026002",
      department: "BCA",
      year: "3rd Year",
      phone: "+91 9876500002",
      academicPercentage: 91,
    });

    const student3 = await User.create({
      name: "Priya Devi",
      email: "priya@campus.edu",
      password: "Student@123",
      role: ROLES.CANDIDATE,
      regNo: "BSC2026003",
      department: "B.Sc Computer Science",
      year: "2nd Year",
      phone: "+91 9876500003",
      academicPercentage: 84,
    });

    const student4 = await User.create({
      name: "Arun Kumar",
      email: "arun@campus.edu",
      password: "Student@123",
      role: ROLES.CANDIDATE,
      regNo: "BCOM2026004",
      department: "B.Com",
      year: "2nd Year",
      phone: "+91 9876500004",
      academicPercentage: 74,
    });

    const student5 = await User.create({
      name: "Sneha Reddy",
      email: "sneha@campus.edu",
      password: "Student@123",
      role: ROLES.STUDENT,
      regNo: "BBA2026005",
      department: "BBA",
      year: "1st Year",
      phone: "+91 9876500005",
      academicPercentage: 65,
    });

    console.log("[Seed] Creating Election with Positions...");
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1); // Started yesterday
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7); // Ends in 7 days

    const election = await Election.create({
      title: "Student Council Campus Election 2026",
      description: "Official annual election for the Student Council executive positions.",
      startDate,
      endDate,
      status: ELECTION_STATUS.ACTIVE,
      isSelfVotingAllowed: false,
      createdBy: admin._id,
    });

    const posChairman = await ElectionPosition.create({
      electionId: election._id,
      title: "Chairman",
      description: "Chief executive representative of the student body (Min 90% required)",
      minAcademicPercentage: 90,
      order: 1,
    });

    const posViceChairman = await ElectionPosition.create({
      electionId: election._id,
      title: "Vice Chairman",
      description: "Deputy executive representative supporting council operations (Min 80% required)",
      minAcademicPercentage: 80,
      order: 2,
    });

    const posSecretary = await ElectionPosition.create({
      electionId: election._id,
      title: "Secretary",
      description: "Responsible for student communications and records (Min 70% required)",
      minAcademicPercentage: 70,
      order: 3,
    });

    console.log("[Seed] Creating Candidate Applications & Approved Profiles with Unique Symbols...");

    // 1. Karthik Raja -> Chairman (Approved, Symbol: Book)
    const app1 = await CandidateApplication.create({
      electionId: election._id,
      positionId: posChairman._id,
      candidateId: student1._id,
      manifesto: "Enhance campus digitization, establish 24/7 library access, and improve placement drives.",
      plannedWork: [
        "Open high-speed WiFi zones across dormitories",
        "Introduce student-run grievance resolution portal",
        "Expand semester technical bootcamps",
      ],
      preferredSymbol: "Book",
      assignedSymbol: SUPPORTED_SYMBOLS[0], // Book
      status: APPLICATION_STATUS.APPROVED,
      reviewComment: "Verified eligibility (94% >= 90%). Outstanding leadership portfolio.",
      reviewedBy: supervisor._id,
      reviewedAt: new Date(),
    });

    await CandidateProfile.create({
      electionId: election._id,
      positionId: posChairman._id,
      candidateId: student1._id,
      applicationId: app1._id,
      assignedSymbol: SUPPORTED_SYMBOLS[0], // Book
      manifesto: app1.manifesto,
      plannedWork: app1.plannedWork,
      photoUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=250&h=250&fit=crop",
      isApproved: true,
    });

    // 2. Rahul Verma -> Chairman (Approved, Symbol: Lamp)
    const app2 = await CandidateApplication.create({
      electionId: election._id,
      positionId: posChairman._id,
      candidateId: student2._id,
      manifesto: "Transparent council budgeting, modern sports gear, and inclusive campus cultural events.",
      plannedWork: [
        "Bi-weekly open budget hearings",
        "Revamp basketball and football courts",
        "Sponsor student hackathons",
      ],
      preferredSymbol: "Lamp",
      assignedSymbol: SUPPORTED_SYMBOLS[1], // Lamp
      status: APPLICATION_STATUS.APPROVED,
      reviewComment: "Verified eligibility (91% >= 90%). Approved for ballot.",
      reviewedBy: supervisor._id,
      reviewedAt: new Date(),
    });

    await CandidateProfile.create({
      electionId: election._id,
      positionId: posChairman._id,
      candidateId: student2._id,
      applicationId: app2._id,
      assignedSymbol: SUPPORTED_SYMBOLS[1], // Lamp
      manifesto: app2.manifesto,
      plannedWork: app2.plannedWork,
      photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&h=250&fit=crop",
      isApproved: true,
    });

    // 3. Priya Devi -> Vice Chairman (Approved, Symbol: Tree)
    const app3 = await CandidateApplication.create({
      electionId: election._id,
      positionId: posViceChairman._id,
      candidateId: student3._id,
      manifesto: "Fostering academic mentoring circles, mental health counseling, and green campus initiatives.",
      plannedWork: [
        "Free peer-tutoring network across departments",
        "Dedicated campus wellness support lines",
        "Campus solar and recycling drive",
      ],
      preferredSymbol: "Tree",
      assignedSymbol: SUPPORTED_SYMBOLS[2], // Tree
      status: APPLICATION_STATUS.APPROVED,
      reviewComment: "Verified eligibility (84% >= 80%). Approved for Vice Chairman position.",
      reviewedBy: supervisor._id,
      reviewedAt: new Date(),
    });

    await CandidateProfile.create({
      electionId: election._id,
      positionId: posViceChairman._id,
      candidateId: student3._id,
      applicationId: app3._id,
      assignedSymbol: SUPPORTED_SYMBOLS[2], // Tree
      manifesto: app3.manifesto,
      plannedWork: app3.plannedWork,
      photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250&h=250&fit=crop",
      isApproved: true,
    });

    // 4. Arun Kumar -> Secretary (Approved, Symbol: Star)
    const app4 = await CandidateApplication.create({
      electionId: election._id,
      positionId: posSecretary._id,
      candidateId: student4._id,
      manifesto: "Prompt documentation, prompt circular dissemination, and student club coordination.",
      plannedWork: [
        "Digital notice board for all college updates",
        "Streamlined venue booking for cultural clubs",
      ],
      preferredSymbol: "Star",
      assignedSymbol: SUPPORTED_SYMBOLS[3], // Star
      status: APPLICATION_STATUS.APPROVED,
      reviewComment: "Verified eligibility (74% >= 70%). Approved for Secretary position.",
      reviewedBy: admin._id,
      reviewedAt: new Date(),
    });

    await CandidateProfile.create({
      electionId: election._id,
      positionId: posSecretary._id,
      candidateId: student4._id,
      applicationId: app4._id,
      assignedSymbol: SUPPORTED_SYMBOLS[3], // Star
      manifesto: app4.manifesto,
      plannedWork: app4.plannedWork,
      photoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&h=250&fit=crop",
      isApproved: true,
    });

    // 5. Rejected application: Sneha Reddy applied for Secretary but had 65% (below 70%)
    await CandidateApplication.create({
      electionId: election._id,
      positionId: posSecretary._id,
      candidateId: student5._id,
      manifesto: "Wants to improve first year orientation programs.",
      plannedWork: ["Freshers guide handbook"],
      status: APPLICATION_STATUS.REJECTED,
      reviewComment: "Rejected: Academic score 65% is below the required 70% threshold for Secretary.",
      reviewedBy: supervisor._id,
      reviewedAt: new Date(),
    });

    console.log("[Seed] Creating Audit Logs...");
    await AuditLog.create({
      action: "DATABASE_SEEDED",
      performedBy: admin._id,
      performedByName: admin.name,
      role: admin.role,
      targetType: "System",
      details: {
        election: election.title,
        positionsCount: 3,
        approvedCandidatesCount: 4,
        rejectedApplicationsCount: 1,
      },
    });

    console.log("\n========================================================");
    console.log("       CAMPUS ELECTION SYSTEM SEED COMPLETED!          ");
    console.log("========================================================");
    console.log(`Admin User:      admin@campus.edu      / Admin@123`);
    console.log(`Supervisor User: supervisor@campus.edu / Supervisor@123`);
    console.log(`Student (94%):   karthik@campus.edu    / Student@123 (Chairman Candidate)`);
    console.log(`Student (91%):   rahul@campus.edu      / Student@123 (Chairman Candidate)`);
    console.log(`Student (84%):   priya@campus.edu      / Student@123 (Vice Chairman Candidate)`);
    console.log(`Student (74%):   arun@campus.edu       / Student@123 (Secretary Candidate)`);
    console.log(`Student (65%):   sneha@campus.edu      / Student@123 (General Student)`);
    console.log("========================================================\n");

    await disconnectDB();
    console.log("[Seed] Disconnected successfully.");
    process.exit(0);
  } catch (error) {
    console.error("[Seed Error]:", error);
    process.exit(1);
  }
};

seedDatabase();
