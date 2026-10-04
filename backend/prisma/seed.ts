import { PrismaClient, Role, AttendanceStatus, ApprovalStatus, EventType, PlacementStatus } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const hash = (pwd: string) => bcrypt.hash(pwd, SALT_ROUNDS);

async function main() {
  console.log("Seeding Vaagdegi Colleges database...");

  // Clean slate (dev only)
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.document.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.eventParticipation.deleteMany(),
    prisma.event.deleteMany(),
    prisma.program.deleteMany(),
    prisma.placement.deleteMany(),
    prisma.certification.deleteMany(),
    prisma.award.deleteMany(),
    prisma.internship.deleteMany(),
    prisma.achievement.deleteMany(),
    prisma.academicRecord.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.facultyProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  // ---------------- DEPARTMENTS ----------------
  const departments = await Promise.all(
    [
      { name: "Computer Science & Engineering", code: "CSE" },
      { name: "Electronics & Communication", code: "ECE" },
      { name: "Mechanical Engineering", code: "MECH" },
      { name: "Business Administration", code: "MBA" },
      { name: "Civil Engineering", code: "CIVIL" },
    ].map((d) => prisma.department.create({ data: d }))
  );

  // ---------------- SUPER ADMIN ----------------
  await prisma.user.create({
    data: { email: "superadmin@vaagdegi.edu", passwordHash: await hash("SuperAdmin@123"), role: Role.SUPER_ADMIN },
  });

  // ---------------- ADMIN ----------------
  await prisma.user.create({
    data: { email: "admin@vaagdegi.edu", passwordHash: await hash("Admin@123"), role: Role.ADMIN },
  });

  // ---------------- FACULTY ----------------
  const facultyUsers = [];
  for (let i = 0; i < 8; i++) {
    const dept = faker.helpers.arrayElement(departments);
    const user = await prisma.user.create({
      data: {
        email: `faculty${i + 1}@vaagdegi.edu`,
        passwordHash: await hash("Faculty@123"),
        role: Role.FACULTY,
        facultyProfile: {
          create: {
            employeeCode: `FAC-${1000 + i}`,
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            designation: faker.helpers.arrayElement(["Assistant Professor", "Associate Professor", "Professor", "HOD"]),
            departmentId: dept.id,
            phone: faker.phone.number({ style: "national" }),
            joiningDate: faker.date.past({ years: 8 }),
          },
        },
      },
    });
    facultyUsers.push(user);
  }

  // ---------------- PROGRAMS ----------------
  const programs = await Promise.all(
    departments.map((d) =>
      prisma.program.create({
        data: {
          name: d.code === "MBA" ? "Master of Business Administration" : `B.Tech ${d.code}`,
          description: `Flagship program offered by the ${d.name} department.`,
          departmentId: d.id,
          durationYears: d.code === "MBA" ? 2 : 4,
        },
      })
    )
  );

  // ---------------- STUDENTS ----------------
  const grades = [
    { grade: "O", gradePoint: 10 },
    { grade: "A+", gradePoint: 9 },
    { grade: "A", gradePoint: 8 },
    { grade: "B+", gradePoint: 7 },
    { grade: "B", gradePoint: 6 },
    { grade: "C", gradePoint: 5 },
  ];
  const subjects = ["Data Structures", "Operating Systems", "Database Systems", "Computer Networks", "Software Engineering", "Mathematics-III"];

  const studentProfiles = [];
  const totalStudents = 60;

  for (let i = 0; i < totalStudents; i++) {
    const dept = faker.helpers.arrayElement(departments);
    const batchYear = faker.helpers.arrayElement([2022, 2023, 2024, 2025]);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const rollNumber = `VG${batchYear}${dept.code}${String(i + 1).padStart(3, "0")}`;

    const user = await prisma.user.create({
      data: {
        email: `student${i + 1}@vaagdegi.edu`,
        passwordHash: await hash("Student@123"),
        role: Role.STUDENT,
        studentProfile: {
          create: {
            rollNumber,
            admissionNumber: `ADM-${batchYear}-${1000 + i}`,
            firstName,
            lastName,
            gender: faker.helpers.arrayElement(["MALE", "FEMALE", "OTHER"]),
            dateOfBirth: faker.date.birthdate({ min: 18, max: 23, mode: "age" }),
            phone: faker.phone.number({ style: "national" }),
            address: faker.location.streetAddress(),
            city: faker.location.city(),
            state: "Telangana",
            pincode: faker.location.zipCode("######"),
            bloodGroup: faker.helpers.arrayElement(["A+", "B+", "O+", "AB+", "A-", "B-", "O-"]),
            departmentId: dept.id,
            program: dept.code === "MBA" ? "MBA" : "B.Tech",
            batchYear,
            currentYear: Math.max(1, new Date().getFullYear() - batchYear + 1),
            currentSemester: faker.number.int({ min: 1, max: 8 }),
            section: faker.helpers.arrayElement(["A", "B", "C"]),
            guardianName: faker.person.fullName(),
            guardianPhone: faker.phone.number({ style: "national" }),
            guardianEmail: faker.internet.email(),
            status: "ACTIVE",
          },
        },
      },
      include: { studentProfile: true },
    });
    studentProfiles.push(user.studentProfile!);
  }

  // ---------------- ATTENDANCE (last 60 days) ----------------
  const today = new Date();
  const attendanceData = [];
  for (const student of studentProfiles) {
    for (let d = 0; d < 60; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0) continue; // skip Sundays
      const roll = Math.random();
      const status: AttendanceStatus = roll < 0.82 ? "PRESENT" : roll < 0.92 ? "ABSENT" : roll < 0.97 ? "LATE" : "EXCUSED";
      attendanceData.push({ studentId: student.id, date, status, subject: faker.helpers.arrayElement(subjects) });
    }
  }
  // Insert in batches
  for (let i = 0; i < attendanceData.length; i += 1000) {
    await prisma.attendance.createMany({ data: attendanceData.slice(i, i + 1000), skipDuplicates: true });
  }

  // ---------------- ACADEMIC RECORDS ----------------
  const academicData = [];
  for (const student of studentProfiles) {
    const maxSem = Math.min(student.currentSemester ?? 1, 6);
    for (let sem = 1; sem <= maxSem; sem++) {
      for (const subject of subjects.slice(0, 5)) {
        const g = faker.helpers.arrayElement(grades);
        academicData.push({
          studentId: student.id,
          year: Math.ceil(sem / 2),
          semester: sem,
          subject,
          credits: faker.helpers.arrayElement([3, 4]),
          grade: g.grade,
          gradePoint: g.gradePoint,
          examType: "SEMESTER",
        });
      }
    }
  }
  await prisma.academicRecord.createMany({ data: academicData });

  // Update CGPA per student
  for (const student of studentProfiles) {
    const records = await prisma.academicRecord.findMany({ where: { studentId: student.id } });
    const totalCredits = records.reduce((s, r) => s + r.credits, 0);
    const weighted = records.reduce((s, r) => s + r.credits * r.gradePoint, 0);
    const cgpa = totalCredits > 0 ? Math.round((weighted / totalCredits) * 100) / 100 : 0;
    await prisma.studentProfile.update({ where: { id: student.id }, data: { cgpa } });
  }

  // ---------------- ACHIEVEMENTS / AWARDS / CERTIFICATIONS / INTERNSHIPS ----------------
  const approvalStatuses: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"];
  const sample = faker.helpers.arrayElements(studentProfiles, 35);

  for (const student of sample) {
    await prisma.achievement.create({
      data: {
        studentId: student.id,
        title: faker.helpers.arrayElement(["Winner - Smart India Hackathon", "Best Paper Award", "Coding Contest Champion", "Top Performer - Semester"]),
        description: faker.lorem.sentence(),
        category: faker.helpers.arrayElement(["Technical", "Academic", "Sports", "Cultural"]),
        date: faker.date.past({ years: 1 }),
        status: faker.helpers.arrayElement(approvalStatuses),
      },
    });

    if (Math.random() > 0.5) {
      await prisma.internship.create({
        data: {
          studentId: student.id,
          companyName: faker.company.name(),
          role: faker.person.jobTitle(),
          startDate: faker.date.past({ years: 1 }),
          endDate: faker.date.recent(),
          stipend: faker.number.int({ min: 5000, max: 40000 }),
          location: faker.location.city(),
          mode: faker.helpers.arrayElement(["Remote", "Onsite", "Hybrid"]),
          description: faker.lorem.sentence(),
          status: faker.helpers.arrayElement(approvalStatuses),
        },
      });
    }

    if (Math.random() > 0.6) {
      await prisma.award.create({
        data: {
          studentId: student.id,
          title: faker.helpers.arrayElement(["Merit Scholarship", "Best Student Award", "Excellence in Sports"]),
          issuedBy: "Vaagdegi Colleges",
          level: faker.helpers.arrayElement(["College", "State", "National"]),
          date: faker.date.past({ years: 1 }),
          status: faker.helpers.arrayElement(approvalStatuses),
        },
      });
    }

    if (Math.random() > 0.5) {
      await prisma.certification.create({
        data: {
          studentId: student.id,
          title: faker.helpers.arrayElement(["AWS Cloud Practitioner", "Google Data Analytics", "NPTEL - Machine Learning", "Cisco CCNA"]),
          issuingOrg: faker.helpers.arrayElement(["AWS", "Google", "NPTEL", "Cisco", "Coursera"]),
          issueDate: faker.date.past({ years: 1 }),
          credentialId: faker.string.alphanumeric(10).toUpperCase(),
          status: faker.helpers.arrayElement(approvalStatuses),
        },
      });
    }
  }

  // ---------------- EVENTS ----------------
  const eventTypes: EventType[] = ["WORKSHOP", "SEMINAR", "HACKATHON", "CULTURAL", "SPORTS", "CONFERENCE", "GUEST_LECTURE"];
  const events = [];
  for (let i = 0; i < 10; i++) {
    const start = faker.date.soon({ days: 60 });
    const event = await prisma.event.create({
      data: {
        title: faker.helpers.arrayElement(["Annual Tech Fest", "AI/ML Workshop", "National Hackathon", "Cultural Night", "Sports Meet", "Industry Conclave", "Guest Lecture on Robotics"]),
        description: faker.lorem.paragraph(),
        type: faker.helpers.arrayElement(eventTypes),
        programId: faker.helpers.arrayElement(programs).id,
        venue: "Vaagdegi Main Auditorium",
        startDate: start,
        endDate: new Date(start.getTime() + 86400000),
        capacity: 200,
      },
    });
    events.push(event);
  }

  for (const event of events) {
    const participants = faker.helpers.arrayElements(studentProfiles, faker.number.int({ min: 5, max: 20 }));
    for (const p of participants) {
      await prisma.eventParticipation.create({
        data: { eventId: event.id, studentId: p.id, role: "Participant" },
      }).catch(() => null);
    }
  }

  // ---------------- PLACEMENTS ----------------
  const placementStatuses: PlacementStatus[] = ["APPLIED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "OFFERED", "REJECTED", "JOINED"];
  const placementSample = faker.helpers.arrayElements(studentProfiles, 25);
  for (const student of placementSample) {
    await prisma.placement.create({
      data: {
        studentId: student.id,
        companyName: faker.company.name(),
        jobTitle: faker.person.jobTitle(),
        packageLPA: faker.number.float({ min: 3, max: 24, fractionDigits: 1 }),
        location: faker.location.city(),
        driveDate: faker.date.past({ years: 1 }),
        status: faker.helpers.arrayElement(placementStatuses),
      },
    });
  }

  // ---------------- ANNOUNCEMENTS ----------------
  const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  await prisma.announcement.createMany({
    data: [
      {
        title: "Mid-Semester Examinations Schedule Released",
        body: "The mid-semester examination timetable has been published. Please check your department notice board and student portal for subject-wise schedules.",
        audience: "STUDENTS",
        pinned: true,
        authorId: adminUser!.id,
      },
      {
        title: "Annual Tech Fest 2026 - Registrations Open",
        body: "Registrations are now open for Vaagdegi's Annual Tech Fest. Participate in hackathons, coding contests, and workshops. Register through the Events section.",
        audience: "ALL",
        pinned: true,
        authorId: adminUser!.id,
      },
      {
        title: "Placement Drive - TCS, Infosys, Wipro",
        body: "Multiple companies are visiting campus this month for placements. Eligible final-year students should update their resumes and register via the Placements section.",
        audience: "STUDENTS",
        authorId: adminUser!.id,
      },
      {
        title: "Faculty Meeting - Curriculum Review",
        body: "All faculty members are requested to attend the curriculum review meeting scheduled in the seminar hall.",
        audience: "FACULTY",
        authorId: adminUser!.id,
      },
    ],
  });

  console.log("✅ Seed completed successfully.");
  console.log("----------------------------------------------------");
  console.log("Super Admin: superadmin@vaagdegi.edu / SuperAdmin@123");
  console.log("Admin:       admin@vaagdegi.edu / Admin@123");
  console.log("Faculty:     faculty1@vaagdegi.edu / Faculty@123");
  console.log("Student:     student1@vaagdegi.edu / Student@123");
  console.log("----------------------------------------------------");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
