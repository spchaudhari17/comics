const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const Subject = require("../../models/Subject");
const sharp = require("sharp");
const mongoose = require('mongoose');
const Quiz = require("../../models/Quiz");
const QuizSubmission = require("../../models/QuizSubmission");
const UserSubjectPriority = require("../../models/UserSubjectPriority");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");
const ComicView = require("../../models/ComicView");

const createSubject = async (req, res) => {
  try {
    const { name, ishowads } = req.body;
    const imageFile = req.files?.image;

    if (!name || !imageFile) {
      return res.status(400).json({ error: "Name and image are required" });
    }

    // Read buffer from uploaded file
    const buffer = Buffer.from(imageFile.data, "binary");

    // 🔹 Resize + compress before upload
    const optimizedBuffer = await sharp(buffer)
      .resize({ width: 600 })        // fix width, auto height
      .jpeg({ quality: 75 })         // compress to 75%
      .toBuffer();

    // Ab helper ke liye ek "fake file object" banao jisme optimized buffer ho
    const optimizedFile = {
      name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"), // png -> jpg
      data: optimizedBuffer,
      mimetype: "image/jpeg"
    };

    // Upload image to S3
    const uploadedUrl = await upload_files("subjects", optimizedFile);
    if (!uploadedUrl) {
      return res.status(500).json({ error: "Image upload failed" });
    }

    // Save subject in DB
    const subject = await Subject.create({
      name,
      image: uploadedUrl,
      ishowads: ishowads
    });

    res.json(subject);
  } catch (error) {
    console.error("Error adding subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// perfect working for web site
const getAllSubjectsForWeb = async (req, res) => {
  try {
    const { search, grade, userId } = req.query;

    const pipeline = [];

    // 🔎 Search filter
    if (search) {
      pipeline.push({
        $match: {
          name: { $regex: search, $options: "i" }
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "concepts",
          localField: "_id",
          foreignField: "subjectId",
          as: "concepts"
        }
      },
      {
        $addFields: {
          conceptIds: {
            $map: { input: "$concepts", as: "c", in: "$$c._id" }
          }
        }
      },
      {
        $lookup: {
          from: "comics",
          let: { cids: "$conceptIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$conceptId", "$$cids"] },
                    { $eq: ["$status", "approved"] }
                  ]
                }
              }
            },
            { $group: { _id: "$conceptId" } }
          ],
          as: "approvedConcepts"
        }
      },
      {
        $addFields: {
          conceptCount: { $size: "$approvedConcepts" }
        }
      },
      {
        $project: {
          concepts: 0,
          conceptIds: 0,
          approvedConcepts: 0
        }
      }
    );

    let subjects = await Subject.aggregate(pipeline);

    // 🔥 Grade filter apply
    if (grade) {
      const gradeNum = parseInt(grade, 10);

      subjects = subjects.filter((s) => {
        // name me "Grades 6–12" type ka text nikalna hai
        const match = s.name.match(/Grades?\s*(\d+)(?:–(\d+))?/);

        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : start;

          return gradeNum >= start && gradeNum <= end;
        }

        return false; // agar grade mention hi nahi hai to exclude
      });
    }



    // 🔥 Global rule: Empty concept list wale subjects ko exclude karo
    // subjects = subjects.filter((s) => s.conceptCount >= 1);


    let prioritySubjects = [];
    let remainingSubjects = subjects;

    if (userId) {
      const pref = await UserSubjectPriority.findOne({ userId });

      if (pref?.selectedSubjects?.length > 0) {
        const selectedIds = pref.selectedSubjects.map((id) => id.toString());

        // Pehle user ke selected subjects
        prioritySubjects = selectedIds
          .map((id) => subjects.find((s) => s._id.toString() === id))
          .filter(Boolean);

        // Fir baki subjects
        remainingSubjects = subjects.filter(
          (s) => !selectedIds.includes(s._id.toString())
        );
      }
    }

    // ✅ Sabse latest subject nikal lo
    let latest = null;
    if (subjects.length > 0) {
      latest = subjects.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
      );
    }

    // ✅ Agar latest already priority me nahi hai, to usse priority ke niche insert karo
    let finalSubjects = [...prioritySubjects];
    if (latest && !prioritySubjects.find((s) => s._id.toString() === latest._id.toString())) {
      finalSubjects.push(latest);
      remainingSubjects = remainingSubjects.filter(
        (s) => s._id.toString() !== latest._id.toString()
      );
    }

    // ✅ Baaki subjects append kar do
    finalSubjects = [...finalSubjects, ...remainingSubjects];

    res.json(finalSubjects);
  } catch (err) {
    console.error("Error fetching subjects with counts:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
};


// country filter out
// const getAllSubjects = async (req, res) => {
//   try {
//     const { search, grade, userId, country } = req.query;

//     const pipeline = [];

//     // 🔍 Search filter (optional)
//     if (search) {
//       pipeline.push({
//         $match: {
//           name: { $regex: search, $options: "i" }
//         }
//       });
//     }

//     // 🧩 Link with concepts and comics
//     pipeline.push(
//       {
//         $lookup: {
//           from: "concepts",
//           localField: "_id",
//           foreignField: "subjectId",
//           as: "concepts"
//         }
//       },
//       {
//         $addFields: {
//           conceptIds: { $map: { input: "$concepts", as: "c", in: "$$c._id" } }
//         }
//       },
//       {
//         $lookup: {
//           from: "comics",
//           let: { cids: "$conceptIds" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $in: ["$conceptId", "$$cids"] },
//                     { $eq: ["$status", "approved"] },
//                     ...(country ? [{ $eq: ["$country", country] }] : []) // ✅ Country filter
//                   ]
//                 }
//               }
//             },
//             { $group: { _id: "$conceptId" } }
//           ],
//           as: "approvedConcepts"
//         }
//       },
//       {
//         $addFields: {
//           conceptCount: { $size: "$approvedConcepts" }
//         }
//       },
//       {
//         $project: {
//           concepts: 0,
//           conceptIds: 0,
//           approvedConcepts: 0
//         }
//       }
//     );

//     let subjects = await Subject.aggregate(pipeline);

//     // 🎓 Grade filter
//     if (grade) {
//       const gradeNum = parseInt(grade, 10);
//       subjects = subjects.filter((s) => {
//         const match = s.name.match(/Grades?\s*(\d+)(?:–(\d+))?/);
//         if (match) {
//           const start = parseInt(match[1], 10);
//           const end = match[2] ? parseInt(match[2], 10) : start;
//           return gradeNum >= start && gradeNum <= end;
//         }
//         return false;
//       });
//     }

//     // 🚫 Remove subjects without approved comics
//     subjects = subjects.filter((s) => s.conceptCount >= 1);

//     // ⚡ Handle user preferences
//     let prioritySubjects = [];
//     let remainingSubjects = subjects;

//     if (userId) {
//       const pref = await UserSubjectPriority.findOne({ userId });
//       if (pref?.selectedSubjects?.length > 0) {
//         const selectedIds = pref.selectedSubjects.map((id) => id.toString());
//         prioritySubjects = selectedIds
//           .map((id) => subjects.find((s) => s._id.toString() === id))
//           .filter(Boolean);
//         remainingSubjects = subjects.filter(
//           (s) => !selectedIds.includes(s._id.toString())
//         );
//       }
//     }

//     // 🕓 Find latest subject
//     let latest = null;
//     if (subjects.length > 0) {
//       latest = subjects.reduce((a, b) =>
//         new Date(a.createdAt) > new Date(b.createdAt) ? a : b
//       );
//     }

//     // Merge final list
//     let finalSubjects = [...prioritySubjects];
//     if (latest && !prioritySubjects.find((s) => s._id.toString() === latest._id.toString())) {
//       finalSubjects.push(latest);
//       remainingSubjects = remainingSubjects.filter(
//         (s) => s._id.toString() !== latest._id.toString()
//       );
//     }

//     finalSubjects = [...finalSubjects, ...remainingSubjects];

//     res.json(finalSubjects);
//   } catch (err) {
//     console.error("Error fetching subjects with counts:", err);
//     res.status(500).json({ error: "Failed to fetch subjects" });
//   }
// };


// countries filter out
const getAllSubjects = async (req, res) => {
  try {
    const { search, grade, userId, country } = req.query;

    const pipeline = [];

    // 🔍 Optional search filter
    if (search) {
      pipeline.push({
        $match: {
          name: { $regex: search, $options: "i" }
        }
      });
    }

    // 🧩 Link subjects → concepts → comics
    pipeline.push(
      {
        $lookup: {
          from: "concepts",
          localField: "_id",
          foreignField: "subjectId",
          as: "concepts"
        }
      },
      {
        $addFields: {
          conceptIds: { $map: { input: "$concepts", as: "c", in: "$$c._id" } }
        }
      },
      {
        $lookup: {
          from: "comics",
          let: { cids: "$conceptIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$conceptId", "$$cids"] },
                    { $eq: ["$status", "approved"] },
                    // ✅ Country filter updated to use "countries" array
                    ...(country
                      ? [
                        {
                          $or: [
                            { $in: [country, "$countries"] }, // if country exists in countries array
                            { $in: ["ALL", "$countries"] }    // OR globally available comics
                          ]
                        }
                      ]
                      : [])
                  ]
                }
              }
            },
            { $group: { _id: "$conceptId" } }
          ],
          as: "approvedConcepts"
        }
      },
      {
        $addFields: {
          conceptCount: { $size: "$approvedConcepts" }
        }
      },
      {
        $project: {
          concepts: 0,
          conceptIds: 0,
          approvedConcepts: 0
        }
      }
    );

    // 🚀 Run aggregation
    let subjects = await Subject.aggregate(pipeline);

    // 🎓 Grade-based filtering
    if (grade) {
      const gradeNum = parseInt(grade, 10);
      subjects = subjects.filter((s) => {
        const match = s.name.match(/Grades?\s*(\d+)(?:–(\d+))?/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : start;
          return gradeNum >= start && gradeNum <= end;
        }
        return false;
      });
    }

    // 🚫 Only subjects having at least 1 approved concept
    subjects = subjects.filter((s) => s.conceptCount >= 1);

    // 👤 Handle user subject preferences
    let prioritySubjects = [];
    let remainingSubjects = subjects;

    if (userId) {
      const pref = await UserSubjectPriority.findOne({ userId });
      if (pref?.selectedSubjects?.length > 0) {
        const selectedIds = pref.selectedSubjects.map((id) => id.toString());
        prioritySubjects = selectedIds
          .map((id) => subjects.find((s) => s._id.toString() === id))
          .filter(Boolean);
        remainingSubjects = subjects.filter(
          (s) => !selectedIds.includes(s._id.toString())
        );
      }
    }

    // 🕓 Find latest added subject
    let latest = null;
    if (subjects.length > 0) {
      latest = subjects.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
      );
    }

    // 📚 Merge prioritized + latest + remaining subjects
    let finalSubjects = [...prioritySubjects];
    if (latest && !prioritySubjects.find((s) => s._id.toString() === latest._id.toString())) {
      finalSubjects.push(latest);
      remainingSubjects = remainingSubjects.filter(
        (s) => s._id.toString() !== latest._id.toString()
      );
    }

    finalSubjects = [...finalSubjects, ...remainingSubjects];

    res.json(finalSubjects);
  } catch (err) {
    console.error("❌ Error fetching subjects with counts:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
};




const deleteSubject = async (req, res) => {
  try {
    const { id } = req.body;

    // Subject find karo
    const subject = await Subject.findById(id);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // Agar image hai toh S3 se delete karo
    if (subject.image) {
      try {
        // S3 me se sirf fileName nikalna hoga (path ke last part)
        const imageUrl = subject.image;
        const fileName = imageUrl.split("/").pop(); // last part after '/'

        await deleteFiles("subjects", fileName);
      } catch (err) {
        console.warn("S3 delete failed:", err);
      }
    }

    // Subject ko DB se delete karo
    await Subject.findByIdAndDelete(id);

    res.json({ success: true, message: "Subject deleted successfully" });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};


// const updateSubject = async (req, res) => {
//   try {
//     const { id, name, ishowads } = req.body;
//     const imageFile = req.files?.image;

//     // Find subject
//     const subject = await Subject.findById(id);
//     if (!subject) {
//       return res.status(404).json({ error: "Subject not found" });
//     }

//     // ✅ Update fields if provided
//     if (name) subject.name = name;
//     if (ishowads !== undefined) subject.ishowads = JSON.parse(ishowads);

//     // ✅ If new image uploaded → replace in S3
//     if (imageFile) {
//       // Delete old one if exists
//       if (subject.image) {
//         try {
//           const fileName = subject.image.split("/").pop();
//           await deleteFiles("subjects", fileName);
//         } catch (err) {
//           console.warn("S3 delete failed:", err);
//         }
//       }

//       const buffer = Buffer.from(imageFile.data, "binary");
//       const optimizedBuffer = await sharp(buffer)
//         .resize({ width: 600 })
//         .jpeg({ quality: 75 })
//         .toBuffer();

//       const optimizedFile = {
//         name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"),
//         data: optimizedBuffer,
//         mimetype: "image/jpeg"
//       };

//       const uploadedUrl = await upload_files("subjects", optimizedFile);
//       if (uploadedUrl) subject.image = uploadedUrl;
//     }

//     await subject.save();

//     res.json({ success: true, message: "Subject updated successfully", subject });
//   } catch (error) {
//     console.error("Error updating subject:", error);
//     res.status(500).json({ error: "Internal server error", details: error.message });
//   }
// };



const updateSubject = async (req, res) => {
  try {
    const {
      id,
      name,
      ishowads,
      showAdsFaq,
      showAdsDidYouKnow,
      showAdsQuiz,
      showAdsHardcoreQuiz
    } = req.body;

    const imageFile = req.files?.image;

    // 🔎 Find subject
    const subject = await Subject.findById(id);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // ✅ Update simple text/boolean fields
    if (name) subject.name = name;
    if (ishowads !== undefined) subject.ishowads = JSON.parse(ishowads);

    // ✅ Handle ads toggles (admin panel flags)
    if (showAdsFaq !== undefined)
      subject.showAdsFaq = JSON.parse(showAdsFaq);
    if (showAdsDidYouKnow !== undefined)
      subject.showAdsDidYouKnow = JSON.parse(showAdsDidYouKnow);
    if (showAdsQuiz !== undefined)
      subject.showAdsQuiz = JSON.parse(showAdsQuiz);
    if (showAdsHardcoreQuiz !== undefined)
      subject.showAdsHardcoreQuiz = JSON.parse(showAdsHardcoreQuiz);

    // ✅ If new image uploaded → replace in S3
    if (imageFile) {
      // Delete old one if exists
      if (subject.image) {
        try {
          const fileName = subject.image.split("/").pop();
          await deleteFiles("subjects", fileName);
        } catch (err) {
          console.warn("S3 delete failed:", err);
        }
      }

      // Optimize + upload
      const buffer = Buffer.from(imageFile.data, "binary");
      const optimizedBuffer = await sharp(buffer)
        .resize({ width: 600 })
        .jpeg({ quality: 75 })
        .toBuffer();

      const optimizedFile = {
        name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"),
        data: optimizedBuffer,
        mimetype: "image/jpeg",
      };

      const uploadedUrl = await upload_files("subjects", optimizedFile);
      if (uploadedUrl) subject.image = uploadedUrl;
    }

    await subject.save();

    res.json({
      success: true,
      message: "Subject updated successfully",
      subject,
    });
  } catch (error) {
    console.error("❌ Error updating subject:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
};



// perfect working on country
// const getConceptsBySubject = async (req, res) => {
//   try {
//     const { subjectId } = req.params;
//     const { country } = req.query; // <-- 🆕 optional query param

//     // 🔍 1. Validate subject
//     const subject = await Subject.findById(subjectId);
//     if (!subject) {
//       return res.status(404).json({ error: "Subject not found" });
//     }

//     // 🧩 2. Build match condition dynamically
//     const matchStage = {
//       status: "approved",
//       subjectId: new mongoose.Types.ObjectId(subjectId),
//     };

//     if (country && country.trim() !== "") {
//       matchStage.country = country.trim();
//     }

//     // 🧠 3. Aggregate
//     const result = await Comic.aggregate([
//       { $match: matchStage },

//       {
//         $group: {
//           _id: {
//             conceptId: "$conceptId",
//             themeId: "$themeId",
//             country: "$country", // 🆕 group by country too
//           },
//           comicCount: { $sum: 1 },
//         },
//       },

//       // 🔍 Join Concept info
//       {
//         $lookup: {
//           from: "concepts",
//           localField: "_id.conceptId",
//           foreignField: "_id",
//           as: "conceptData",
//         },
//       },
//       { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

//       // 🔍 Join Theme info
//       {
//         $lookup: {
//           from: "themes",
//           localField: "_id.themeId",
//           foreignField: "_id",
//           as: "themeData",
//         },
//       },
//       { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },

//       // 🧩 4. Project final output
//       {
//         $project: {
//           _id: 0,
//           conceptId: "$conceptData._id",
//           conceptName: "$conceptData.name",
//           themeId: "$themeData._id",
//           themeName: "$themeData.name",
//           country: "$_id.country", // 🆕 include country
//           comicCount: 1,
//         },
//       },

//       // 🧩 5. Sort neatly
//       {
//         $sort: {
//           conceptName: 1,
//           themeName: 1,
//           country: 1,
//         },
//       },
//     ]);

//     // ✅ 6. Response
//     res.json({
//       subject: subject.name,
//       countryFilter: country || "All",
//       totalConcepts: result.length,
//       concepts: result,
//     });
//   } catch (error) {
//     console.error("Error fetching concepts:", error);
//     res.status(500).json({ error: "Failed to fetch concepts" });
//   }
// };

// perfect working on countries
// const getConceptsBySubject = async (req, res) => {
//   try {
//     const { subjectId } = req.params;
//     const { country } = req.query; // optional query param

//     // 🔍 1. Validate subject
//     const subject = await Subject.findById(subjectId);
//     if (!subject) {
//       return res.status(404).json({ error: "Subject not found" });
//     }

//     // 🧠 2. Build aggregation pipeline
//     const pipeline = [
//       {
//         $match: {
//           status: "approved",
//           subjectId: new mongoose.Types.ObjectId(subjectId)
//         }
//       },
//     ];

//     // 🧩 3. Country filter (using 'countries' array)
//     if (country && country.trim() !== "") {
//       pipeline.push({
//         $match: {
//           $expr: {
//             $or: [
//               { $in: [country.trim(), "$countries"] },
//               { $in: ["ALL", "$countries"] }
//             ]
//           }
//         }
//       });
//     }

//     // 🧱 4. Group by concept & theme
//     pipeline.push({
//       $group: {
//         _id: {
//           conceptId: "$conceptId",
//           themeId: "$themeId"
//         },
//         countries: { $addToSet: "$countries" }, // keep list of countries where comic exists
//         comicCount: { $sum: 1 }
//       }
//     });

//     // 🔍 5. Join Concept info
//     pipeline.push(
//       {
//         $lookup: {
//           from: "concepts",
//           localField: "_id.conceptId",
//           foreignField: "_id",
//           as: "conceptData"
//         }
//       },
//       { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

//       // 🔍 6. Join Theme info
//       {
//         $lookup: {
//           from: "themes",
//           localField: "_id.themeId",
//           foreignField: "_id",
//           as: "themeData"
//         }
//       },
//       { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },

//       // 🧩 7. Project final output
//       {
//         $project: {
//           _id: 0,
//           conceptId: "$conceptData._id",
//           conceptName: "$conceptData.name",
//           themeId: "$themeData._id",
//           themeName: "$themeData.name",
//           countries: 1,
//           comicCount: 1
//         }
//       },

//       // 🧩 8. Sort neatly
//       {
//         $sort: {
//           conceptName: 1,
//           themeName: 1
//         }
//       }
//     );

//     // 🧠 9. Execute pipeline
//     const result = await Comic.aggregate(pipeline);

//     // ✅ 10. Response
//     res.json({
//       subject: subject.name,
//       countryFilter: country || "All",
//       totalConcepts: result.length,
//       concepts: result
//     });
//   } catch (error) {
//     console.error("❌ Error fetching concepts:", error);
//     res.status(500).json({ error: "Failed to fetch concepts" });
//   }
// };


const getConceptsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { country, grade } = req.query; // 👈 grade added

    // 🔍 1. Validate subject
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // 🧠 2. Base pipeline
    const pipeline = [
      {
        $match: {
          status: "approved",
          subjectId: new mongoose.Types.ObjectId(subjectId),
        },
      },
    ];

    // 🧩 3. Country filter
    if (country && country.trim() !== "") {
      pipeline.push({
        $match: {
          $expr: {
            $or: [
              { $in: [country.trim().toUpperCase(), "$countries"] },
              { $in: ["ALL", "$countries"] },
            ],
          },
        },
      });
    }

    // 🎓 4. Grade filter (NEW)
    if (grade && grade.trim() !== "") {
      pipeline.push({
        $match: {
          grade: { $regex: new RegExp(`^${grade.trim()}$`, "i") },
        },
      });
    }

    // 🧱 5. Group by concept & theme
    pipeline.push({
      $group: {
        _id: {
          conceptId: "$conceptId",
          themeId: "$themeId",
        },
        countries: { $addToSet: "$countries" },
        grades: { $addToSet: "$grade" }, // 👈 grade list (optional)
        comicCount: { $sum: 1 },
      },
    });

    // 🔍 6. Join Concept info
    pipeline.push(
      {
        $lookup: {
          from: "concepts",
          localField: "_id.conceptId",
          foreignField: "_id",
          as: "conceptData",
        },
      },
      { $unwind: { path: "$conceptData", preserveNullAndEmptyArrays: true } },

      // 🔍 7. Join Theme
      {
        $lookup: {
          from: "themes",
          localField: "_id.themeId",
          foreignField: "_id",
          as: "themeData",
        },
      },
      { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },

      // 🧩 8. Final projection
      {
        $project: {
          _id: 0,
          conceptId: "$conceptData._id",
          conceptName: "$conceptData.name",
          themeId: "$themeData._id",
          themeName: "$themeData.name",
          countries: 1,
          grades: 1,     // 👈 helpful for FE
          comicCount: 1,
        },
      },

      // 🧩 9. Sort neatly
      {
        $sort: {
          conceptName: 1,
          themeName: 1,
        },
      }
    );

    // 🧠 10. Execute
    const result = await Comic.aggregate(pipeline);

    // ✅ Response
    res.json({
      subject: subject.name,
      countryFilter: country || "ALL",
      gradeFilter: grade || "ALL",
      totalConcepts: result.length,
      concepts: result,
    });

  } catch (error) {
    console.error("❌ Error fetching concepts:", error);
    res.status(500).json({ error: "Failed to fetch concepts" });
  }
};



const getComicsByConcept = async (req, res) => {
  try {
    const conceptId = req.params.conceptId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const userId = req.query.userId;
    const country = req.query.country;
    const grade = req.query.grade;

    // 🧠 Base match query
    const matchQuery = {
      status: "approved",                 // ✅ approved only
      comicStatus: "published",           // ✅ published only
      pdfUrl: { $exists: true, $ne: "" }, // ✅ pdfUrl must exist and not be empty
      conceptId: new mongoose.Types.ObjectId(conceptId),
    };

    // 🌍 Country filter using "countries" array
    if (country && country.trim() !== "") {
      matchQuery.$expr = {
        $or: [
          { $in: [country.trim().toUpperCase(), "$countries"] },
          { $in: ["ALL", "$countries"] },
        ],
      };
    }

    // 🎓 Grade filter
    if (grade && grade.trim() !== "") {
      matchQuery.grade = { $regex: new RegExp(`^${grade.trim()}$`, "i") };
    }

    // 🔹 Fetch comics with lookups
    let comics = await Comic.aggregate([
      { $match: matchQuery },
      { $sort: { partNumber: 1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: "faqs", localField: "_id", foreignField: "comicId", as: "faqs" } },
      { $lookup: { from: "didyouknows", localField: "_id", foreignField: "comicId", as: "facts" } },
      { $lookup: { from: "hardcorequizzes", localField: "_id", foreignField: "comicId", as: "hardcoreQuizData" } },
      { $lookup: { from: "subjects", localField: "subjectId", foreignField: "_id", as: "subjectData" } },
      { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "themes", localField: "themeId", foreignField: "_id", as: "themeData" } },
      { $unwind: { path: "$themeData", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "comicpages", localField: "_id", foreignField: "comicId", as: "pages" } },
      {
        $addFields: {
          hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
          hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
          hasHardcoreQuiz: { $gt: [{ $size: "$hardcoreQuizData" }, 0] },
          thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },
          subject: "$subjectData.name",
          theme: "$themeData.name",
        },
      },
      {
        $project: {
          faqs: 0,
          facts: 0,
          hardcoreQuizData: 0,
          pages: 0,
          subjectData: 0,
          themeData: 0,
          prompt: 0,
        },
      },
    ]);

    // ✅ Step 2 — Add attempt data if user logged in
    if (userId) {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const comicIds = comics.map((c) => c._id);

      const quizzes = await Quiz.find({ comicId: { $in: comicIds } }, "_id comicId");
      const hardcoreQuizzes = await HardcoreQuiz.find({ comicId: { $in: comicIds } }, "_id comicId");

      const normalSubmissions = await QuizSubmission.find(
        { quizId: { $in: quizzes.map((q) => q._id) }, userId: userObjectId },
        "quizId"
      );

      const hardcoreSubmissions = await HardcoreQuizSubmission.find({
        quizId: { $in: hardcoreQuizzes.map((hq) => hq._id) },
        userId: userObjectId,
      })
        .sort({ createdAt: -1 })
        .lean();

      const submissionsByQuiz = {};
      hardcoreSubmissions.forEach((s) => {
        if (!submissionsByQuiz[s.quizId.toString()]) {
          submissionsByQuiz[s.quizId.toString()] = [];
        }
        submissionsByQuiz[s.quizId.toString()].push(s);
      });

      const attemptedQuizIds = new Set(normalSubmissions.map((s) => s.quizId.toString()));

      comics.forEach((comic) => {
        const quiz = quizzes.find((q) => q.comicId.toString() === comic._id.toString());
        const hardcoreQuiz = hardcoreQuizzes.find((hq) => hq.comicId.toString() === comic._id.toString());

        comic.hasAttempted = quiz ? attemptedQuizIds.has(quiz._id.toString()) : false;

        if (hardcoreQuiz) {
          const quizId = hardcoreQuiz._id.toString();
          const submissions = submissionsByQuiz[quizId] || [];

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const finishedAttemptsToday = submissions.filter(
            (s) =>
              s.isFinished &&
              s.createdAt >= todayStart &&
              s.createdAt <= todayEnd
          ).length;

          const hasHardCoreChanceLeft = finishedAttemptsToday >= 2 ? 0 : 1;

          let attemptNumber = 1;
          if (finishedAttemptsToday >= 2) attemptNumber = 2;
          else if (finishedAttemptsToday === 1) attemptNumber = 2;
          else attemptNumber = 1;

          const activeSubmission = submissions.find((s) => s.isActive) || null;

          comic.hasAttemptedHardcore = submissions.length > 0;
          comic.attemptNumber = attemptNumber;
          comic.hasHardCoreChanceLeft = hasHardCoreChanceLeft;
          comic.activeSubmission = activeSubmission
            ? {
              _id: activeSubmission._id,
              attemptNumber: activeSubmission.attemptNumber,
              score: activeSubmission.score,
              coinsEarned: activeSubmission.coinsEarned,
              expEarned: activeSubmission.expEarned,
              isActive: activeSubmission.isActive,
            }
            : null;
        } else {
          comic.hasAttemptedHardcore = false;
          comic.attemptNumber = 0;
          comic.hasHardCoreChanceLeft = 0;
          comic.activeSubmission = null;
        }
      });
    } else {
      comics.forEach((comic) => {
        comic.hasAttempted = false;
        comic.hasAttemptedHardcore = false;
        comic.attemptNumber = 0;
        comic.hasHardCoreChanceLeft = 0;
        comic.activeSubmission = null;
      });
    }

    // 🧩 Series open logic
    comics = comics.sort((a, b) => {
      const aSeries = a.seriesId ? a.seriesId.toString() : "";
      const bSeries = b.seriesId ? b.seriesId.toString() : "";
      if (aSeries === bSeries) return a.partNumber - b.partNumber;
      return aSeries.localeCompare(bSeries);
    });

    const seriesGroups = {};
    comics.forEach((comic) => {
      const key = comic.seriesId ? comic.seriesId.toString() : "no-series";
      if (!seriesGroups[key]) seriesGroups[key] = [];
      seriesGroups[key].push(comic);
    });

    Object.values(seriesGroups).forEach((seriesComics) => {
      seriesComics.sort((a, b) => a.partNumber - b.partNumber);
      if (seriesComics.length === 1) {
        seriesComics[0].isOpen = true;
      } else {
        seriesComics.forEach((comic) => {
          if (comic.partNumber === 1) {
            comic.isOpen = true;
          } else {
            const prevComic = seriesComics.find(
              (c) => c.partNumber === comic.partNumber - 1
            );
            comic.isOpen = prevComic && prevComic.hasAttempted ? true : false;
          }
        });
      }
    });

    // 🧮 Count total comics (same filter)
    const totalComics = await Comic.countDocuments({
      status: "approved",
      comicStatus: "published",
      pdfUrl: { $exists: true, $ne: "" },
      conceptId: new mongoose.Types.ObjectId(conceptId),
      ...(grade && { grade: { $regex: new RegExp(`^${grade.trim()}$`, "i") } }),
      ...(country && {
        $or: [
          { countries: country.trim().toUpperCase() },
          { countries: "ALL" },
        ],
      }),
    });

    // ✅ Response
    res.json({
      conceptId,
      country: country || "ALL",
      grade: grade || "ALL",
      page,
      limit,
      totalPages: Math.ceil(totalComics / limit),
      totalComics,
      comics,
    });
  } catch (error) {
    console.error("❌ Error fetching comics by concept:", error);
    res.status(500).json({ error: "Failed to fetch comics" });
  }
};



const saveSubjectPriority = async (req, res) => {
  try {
    const userId = req.body.userId;

    const { selectedSubjects } = req.body;

    if (!userId || !selectedSubjects || !Array.isArray(selectedSubjects)) {
      return res.status(400).json({ error: "userId and selectedSubjects[] required" });
    }

    // Save or update
    const priority = await UserSubjectPriority.findOneAndUpdate(
      { userId },
      { selectedSubjects },
      { upsert: true, new: true }
    );

    res.json({ success: true, priority });
  } catch (error) {
    console.error("Error saving subject priority:", error);
    res.status(500).json({ error: "Failed to save subject priority" });
  }
};




module.exports = { createSubject, updateSubject, getAllSubjects, getAllSubjectsForWeb, deleteSubject, getConceptsBySubject, getComicsByConcept, saveSubjectPriority };
